-- Revi-zon : droits d'accès
-- Principe : chaque étudiant ne voit et ne modifie que ses propres données.
-- Le contenu généré par l'IA (passages, exercices, fiches, usage) est écrit
-- uniquement côté serveur avec la clé service_role, qui ignore le RLS.

-- ---------------------------------------------------------------------------
-- Privilèges de base : rien pour les visiteurs non connectés
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;

grant usage on schema public to authenticated;

-- Lecture
grant select on
  public.plan_limits,
  public.profiles,
  public.subjects,
  public.documents,
  public.usage_monthly,
  public.document_chunks,
  public.generations,
  public.exercises,
  public.revision_sheets,
  public.attempts,
  public.review_schedule,
  public.subject_progress
to authenticated;

-- Écriture côté client, limitée aux colonnes modifiables par l'étudiant
grant update (display_name, school_level, locale, onboarding_completed) on public.profiles to authenticated;
grant insert (id, name, color), update (name, color), delete on public.subjects to authenticated;
grant insert (id, subject_id, title, source, storage_path, mime_type, size_bytes),
      update (subject_id, title),
      delete
   on public.documents to authenticated;
grant delete on public.exercises, public.revision_sheets to authenticated;
grant insert (exercise_id, is_correct, quality, answer, response_ms) on public.attempts to authenticated;
grant insert (exercise_id), update (ease_factor, interval_days, repetitions, due_at, last_reviewed_at)
   on public.review_schedule to authenticated;

grant execute on function public.record_attempt(uuid, smallint, jsonb, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.plan_limits enable row level security;
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.documents enable row level security;
alter table public.usage_monthly enable row level security;
alter table public.document_chunks enable row level security;
alter table public.generations enable row level security;
alter table public.exercises enable row level security;
alter table public.revision_sheets enable row level security;
alter table public.attempts enable row level security;
alter table public.review_schedule enable row level security;

-- Plans : lisibles par tous les comptes connectés
create policy "plan_limits_read" on public.plan_limits
  for select to authenticated using (true);

-- Profil
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Matières
create policy "subjects_select_own" on public.subjects
  for select to authenticated using (user_id = (select auth.uid()));
create policy "subjects_insert_own" on public.subjects
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "subjects_update_own" on public.subjects
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "subjects_delete_own" on public.subjects
  for delete to authenticated using (user_id = (select auth.uid()));

-- Documents
create policy "documents_select_own" on public.documents
  for select to authenticated using (user_id = (select auth.uid()));
create policy "documents_insert_own" on public.documents
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "documents_update_own" on public.documents
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "documents_delete_own" on public.documents
  for delete to authenticated using (user_id = (select auth.uid()));

-- Usage : lecture seule
create policy "usage_select_own" on public.usage_monthly
  for select to authenticated using (user_id = (select auth.uid()));

-- Contenu généré : lecture (et suppression des exercices / fiches)
create policy "chunks_select_own" on public.document_chunks
  for select to authenticated using (user_id = (select auth.uid()));

create policy "generations_select_own" on public.generations
  for select to authenticated using (user_id = (select auth.uid()));

create policy "exercises_select_own" on public.exercises
  for select to authenticated using (user_id = (select auth.uid()));
create policy "exercises_delete_own" on public.exercises
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "sheets_select_own" on public.revision_sheets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "sheets_delete_own" on public.revision_sheets
  for delete to authenticated using (user_id = (select auth.uid()));

-- Réponses
create policy "attempts_select_own" on public.attempts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "attempts_insert_own" on public.attempts
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Planning de révision
create policy "schedule_select_own" on public.review_schedule
  for select to authenticated using (user_id = (select auth.uid()));
create policy "schedule_insert_own" on public.review_schedule
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "schedule_update_own" on public.review_schedule
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
