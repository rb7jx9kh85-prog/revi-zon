-- Revi-zon : Studio Revi (conversations), sessions de révision planifiées,
-- résumé détaillé des cours.

-- ---------------------------------------------------------------------------
-- Résumé détaillé d'un cours (généré à la demande, mis en cache)
-- ---------------------------------------------------------------------------

alter table public.documents add column summary_md text;

-- ---------------------------------------------------------------------------
-- Studio Revi : conversations avec le tuteur
-- Les messages sont écrits par la fonction « tutor » (clé secrète) ;
-- l'étudiant lit ses conversations, peut les renommer et les supprimer.
-- ---------------------------------------------------------------------------

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid,
  title text not null default 'Nouvelle conversation' check (char_length(btrim(title)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete set null (document_id)
);

create index chat_threads_user_updated_idx on public.chat_threads (user_id, updated_at desc);

create trigger chat_threads_set_updated_at
  before update on public.chat_threads
  for each row execute function public.set_updated_at();

create table public.chat_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now(),
  foreign key (thread_id, user_id) references public.chat_threads (id, user_id) on delete cascade
);

create index chat_messages_thread_idx on public.chat_messages (thread_id, id);

-- ---------------------------------------------------------------------------
-- Sessions de révision planifiées (calendrier du tableau de bord)
-- ---------------------------------------------------------------------------

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  starts_at timestamptz not null,
  duration_min integer not null default 30 check (duration_min between 5 and 240),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete set null (document_id)
);

create index study_sessions_user_start_idx on public.study_sessions (user_id, starts_at);

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------

grant select, delete on public.chat_threads to authenticated;
grant update (title) on public.chat_threads to authenticated;
grant select on public.chat_messages to authenticated;
grant select, delete on public.study_sessions to authenticated;
grant insert (document_id, title, starts_at, duration_min), update (title, starts_at, duration_min, done)
   on public.study_sessions to authenticated;

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.study_sessions enable row level security;

create policy "threads_select_own" on public.chat_threads
  for select to authenticated using (user_id = (select auth.uid()));
create policy "threads_update_own" on public.chat_threads
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "threads_delete_own" on public.chat_threads
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "messages_select_own" on public.chat_messages
  for select to authenticated using (user_id = (select auth.uid()));

create policy "sessions_select_own" on public.study_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "sessions_insert_own" on public.study_sessions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "sessions_update_own" on public.study_sessions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "sessions_delete_own" on public.study_sessions
  for delete to authenticated using (user_id = (select auth.uid()));
