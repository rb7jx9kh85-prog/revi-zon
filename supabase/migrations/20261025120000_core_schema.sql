-- Revi-zon : schéma principal
-- Tables métier, types, contraintes, index et triggers.
-- Les règles d'accès (RLS) sont dans la migration suivante.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.plan_tier as enum ('free', 'pro');
create type public.document_source as enum ('pdf', 'image', 'docx', 'pptx', 'text');
create type public.document_status as enum ('uploaded', 'processing', 'ready', 'failed');
create type public.exercise_kind as enum ('flashcard', 'cloze', 'quiz');
create type public.generation_kind as enum ('flashcard', 'cloze', 'quiz', 'sheet');
create type public.generation_status as enum ('pending', 'running', 'succeeded', 'failed');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Plans et limites
-- ---------------------------------------------------------------------------

create table public.plan_limits (
  plan plan_tier primary key,
  max_documents_per_month integer not null check (max_documents_per_month >= 0),
  max_generations_per_month integer not null check (max_generations_per_month >= 0),
  max_file_size_mb integer not null check (max_file_size_mb > 0)
);

insert into public.plan_limits (plan, max_documents_per_month, max_generations_per_month, max_file_size_mb) values
  ('free', 3, 30, 10),
  ('pro', 200, 2000, 25);

-- ---------------------------------------------------------------------------
-- Profils (1 ligne par compte auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  school_level text check (char_length(school_level) <= 60),
  locale text not null default 'fr' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  plan plan_tier not null default 'free',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crée le profil automatiquement à l'inscription.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 80)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Matières
-- ---------------------------------------------------------------------------

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  color text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index subjects_user_name_key on public.subjects (user_id, lower(btrim(name)));

create trigger subjects_set_updated_at
  before update on public.subjects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Documents importés (fichier dans le bucket "documents")
-- ---------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  subject_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  source document_source not null,
  -- Chemin dans le bucket : <user_id>/<document_id>/<nom du fichier>
  storage_path text check (storage_path is null or storage_path like (user_id::text || '/%')),
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  page_count integer check (page_count >= 0),
  status document_status not null default 'uploaded',
  error_message text,
  extracted_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id)
);

create index documents_user_created_idx on public.documents (user_id, created_at desc);
create index documents_subject_idx on public.documents (subject_id) where subject_id is not null;

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Usage mensuel (quotas)
-- ---------------------------------------------------------------------------

create table public.usage_monthly (
  user_id uuid not null references public.profiles (id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  documents_count integer not null default 0 check (documents_count >= 0),
  generations_count integer not null default 0 check (generations_count >= 0),
  tokens_used bigint not null default 0 check (tokens_used >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  primary key (user_id, period)
);

-- Refuse un import au-delà du quota du plan et compte l'import.
create or replace function public.enforce_document_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
  v_period date := date_trunc('month', now())::date;
begin
  select pl.max_documents_per_month
    into v_limit
    from public.profiles p
    join public.plan_limits pl on pl.plan = p.plan
   where p.id = new.user_id;

  insert into public.usage_monthly (user_id, period)
  values (new.user_id, v_period)
  on conflict (user_id, period) do nothing;

  select documents_count
    into v_used
    from public.usage_monthly
   where user_id = new.user_id and period = v_period
   for update;

  if v_used >= coalesce(v_limit, 0) then
    raise exception 'Quota mensuel de documents atteint (% / %)', v_used, coalesce(v_limit, 0)
      using errcode = 'P0001', hint = 'quota_documents';
  end if;

  update public.usage_monthly
     set documents_count = documents_count + 1
   where user_id = new.user_id and period = v_period;

  return new;
end;
$$;

create trigger documents_enforce_quota
  before insert on public.documents
  for each row execute function public.enforce_document_quota();

-- ---------------------------------------------------------------------------
-- Passages du cours + embeddings (recherche sémantique pour l'IA)
-- ---------------------------------------------------------------------------

create table public.document_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null,
  user_id uuid not null,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  token_count integer check (token_count >= 0),
  page_number integer check (page_number >= 1),
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade
);

create index document_chunks_user_idx on public.document_chunks (user_id);
create index document_chunks_embedding_idx on public.document_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Appels à l'IA (suivi des coûts et des erreurs)
-- ---------------------------------------------------------------------------

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  document_id uuid not null,
  kind generation_kind not null,
  status generation_status not null default 'pending',
  model text,
  params jsonb not null default '{}'::jsonb,
  prompt_tokens integer check (prompt_tokens >= 0),
  completion_tokens integer check (completion_tokens >= 0),
  cost_usd numeric(10, 6) check (cost_usd >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, user_id),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade
);

create index generations_user_created_idx on public.generations (user_id, created_at desc);
create index generations_document_idx on public.generations (document_id);

-- ---------------------------------------------------------------------------
-- Exercices : flashcards, textes à trous, quiz
-- Le contenu est en JSON, validé par type :
--   flashcard : {"front": text, "back": text}
--   cloze     : {"text": "La {{1}} capte la lumière", "answers": ["chlorophylle"]}
--   quiz      : {"question": text, "options": [text, ...], "correct_index": int, "explanation": text?}
-- ---------------------------------------------------------------------------

create or replace function public.is_valid_exercise_content(p_kind public.exercise_kind, p_content jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- coalesce : un champ manquant donne NULL, qu'un CHECK accepterait sinon
  select coalesce(case p_kind
    when 'flashcard' then
      jsonb_typeof(p_content -> 'front') = 'string'
      and jsonb_typeof(p_content -> 'back') = 'string'
      and length(p_content ->> 'front') > 0
      and length(p_content ->> 'back') > 0
    when 'cloze' then
      jsonb_typeof(p_content -> 'text') = 'string'
      and jsonb_typeof(p_content -> 'answers') = 'array'
      and jsonb_array_length(p_content -> 'answers') > 0
      and (p_content ->> 'text') like '%{{1}}%'
    when 'quiz' then
      jsonb_typeof(p_content -> 'question') = 'string'
      and jsonb_typeof(p_content -> 'options') = 'array'
      and jsonb_array_length(p_content -> 'options') between 2 and 6
      and jsonb_typeof(p_content -> 'correct_index') = 'number'
      and (p_content ->> 'correct_index')::int >= 0
      and (p_content ->> 'correct_index')::int < jsonb_array_length(p_content -> 'options')
    else false
  end, false);
$$;

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  document_id uuid not null,
  generation_id uuid,
  kind exercise_kind not null,
  difficulty smallint not null default 2 check (difficulty between 1 and 5),
  content jsonb not null,
  source_chunk_ids bigint[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (id, user_id),
  check (public.is_valid_exercise_content(kind, content)),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade,
  foreign key (generation_id, user_id) references public.generations (id, user_id) on delete set null (generation_id)
);

create index exercises_user_kind_idx on public.exercises (user_id, kind);
create index exercises_document_idx on public.exercises (document_id);

-- ---------------------------------------------------------------------------
-- Fiches de révision (texte Markdown)
-- ---------------------------------------------------------------------------

create table public.revision_sheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  document_id uuid not null,
  generation_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  content_md text not null check (char_length(content_md) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade,
  foreign key (generation_id, user_id) references public.generations (id, user_id) on delete set null (generation_id)
);

create index revision_sheets_document_idx on public.revision_sheets (document_id);
create index revision_sheets_user_idx on public.revision_sheets (user_id);

create trigger revision_sheets_set_updated_at
  before update on public.revision_sheets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Réponses de l'étudiant
-- ---------------------------------------------------------------------------

create table public.attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  exercise_id uuid not null,
  is_correct boolean not null,
  -- Note de 0 à 5 (algorithme SM-2) : 0 = trou noir, 5 = réponse parfaite
  quality smallint not null check (quality between 0 and 5),
  answer jsonb,
  response_ms integer check (response_ms >= 0),
  created_at timestamptz not null default now(),
  foreign key (exercise_id, user_id) references public.exercises (id, user_id) on delete cascade
);

create index attempts_user_created_idx on public.attempts (user_id, created_at desc);
create index attempts_exercise_idx on public.attempts (exercise_id);

-- ---------------------------------------------------------------------------
-- Répétition espacée : prochaine révision de chaque exercice
-- ---------------------------------------------------------------------------

create table public.review_schedule (
  exercise_id uuid primary key,
  user_id uuid not null default auth.uid(),
  ease_factor numeric(4, 2) not null default 2.50 check (ease_factor >= 1.30),
  interval_days integer not null default 0 check (interval_days >= 0),
  repetitions integer not null default 0 check (repetitions >= 0),
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  foreign key (exercise_id, user_id) references public.exercises (id, user_id) on delete cascade
);

create index review_schedule_user_due_idx on public.review_schedule (user_id, due_at);

-- Chaque nouvel exercice est à réviser tout de suite.
create or replace function public.schedule_new_exercise()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.review_schedule (exercise_id, user_id)
  values (new.id, new.user_id)
  on conflict (exercise_id) do nothing;
  return new;
end;
$$;

create trigger exercises_schedule_review
  after insert on public.exercises
  for each row execute function public.schedule_new_exercise();

-- Enregistre une réponse et recalcule la prochaine révision (SM-2).
-- Appelée depuis l'app : supabase.rpc('record_attempt', {...})
create or replace function public.record_attempt(
  p_exercise_id uuid,
  p_quality smallint,
  p_answer jsonb default null,
  p_response_ms integer default null
)
returns public.review_schedule
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_sched public.review_schedule;
  v_ef numeric;
  v_interval integer;
  v_reps integer;
begin
  if v_user is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;
  if p_quality is null or p_quality < 0 or p_quality > 5 then
    raise exception 'quality doit être entre 0 et 5' using errcode = '22023';
  end if;

  -- user_id prend sa valeur par défaut (auth.uid())
  insert into public.attempts (exercise_id, is_correct, quality, answer, response_ms)
  values (p_exercise_id, p_quality >= 3, p_quality, p_answer, p_response_ms);

  select * into v_sched
    from public.review_schedule
   where exercise_id = p_exercise_id and user_id = v_user
   for update;

  if not found then
    insert into public.review_schedule (exercise_id)
    values (p_exercise_id)
    returning * into v_sched;
  end if;

  v_ef := greatest(1.30, v_sched.ease_factor + (0.1 - (5 - p_quality) * (0.08 + (5 - p_quality) * 0.02)));

  if p_quality < 3 then
    v_reps := 0;
    v_interval := 1;
  else
    v_reps := v_sched.repetitions + 1;
    v_interval := case
      when v_reps = 1 then 1
      when v_reps = 2 then 6
      else greatest(1, round(v_sched.interval_days * v_ef)::integer)
    end;
  end if;

  update public.review_schedule
     set ease_factor = round(v_ef, 2),
         interval_days = v_interval,
         repetitions = v_reps,
         due_at = now() + make_interval(days => v_interval),
         last_reviewed_at = now()
   where exercise_id = p_exercise_id
  returning * into v_sched;

  return v_sched;
end;
$$;

-- ---------------------------------------------------------------------------
-- Progression par matière (vue, respecte les droits de l'appelant)
-- ---------------------------------------------------------------------------

create view public.subject_progress
with (security_invoker = true)
as
select
  d.user_id,
  d.subject_id,
  count(distinct e.id) as exercises_total,
  count(distinct e.id) filter (where rs.repetitions >= 2) as exercises_mastered,
  count(distinct e.id) filter (where rs.due_at <= now()) as exercises_due,
  round(
    100.0 * count(distinct e.id) filter (where rs.repetitions >= 2)
    / nullif(count(distinct e.id), 0)
  )::integer as mastery_percent
from public.documents d
join public.exercises e on e.document_id = d.id
left join public.review_schedule rs on rs.exercise_id = e.id
group by d.user_id, d.subject_id;
