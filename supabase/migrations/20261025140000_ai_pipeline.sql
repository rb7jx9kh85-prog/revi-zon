-- Revi-zon : moteur de génération IA
-- Une génération "study_set" produit en un seul appel la fiche, les flashcards,
-- les textes à trous, le quiz et les questions suggérées pour le chat.

alter type public.generation_kind add value if not exists 'study_set';

alter table public.documents
  add column openai_file_id text,
  add column summary text,
  add column suggested_questions text[] not null default '{}';

-- Quota de générations + comptage de l'usage IA. Réservé au serveur.
create or replace function public.consume_generation_quota(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_period date := date_trunc('month', now())::date;
  v_used integer;
begin
  select pl.max_generations_per_month into v_limit
    from public.profiles p
    join public.plan_limits pl on pl.plan = p.plan
   where p.id = p_user;

  insert into public.usage_monthly (user_id, period) values (p_user, v_period)
  on conflict (user_id, period) do nothing;

  select generations_count into v_used
    from public.usage_monthly
   where user_id = p_user and period = v_period
   for update;

  if v_used >= coalesce(v_limit, 0) then
    return false;
  end if;

  update public.usage_monthly
     set generations_count = generations_count + 1
   where user_id = p_user and period = v_period;
  return true;
end;
$$;

create or replace function public.record_ai_usage(p_user uuid, p_tokens bigint, p_cost numeric)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.usage_monthly (user_id, period, tokens_used, cost_usd)
  values (p_user, date_trunc('month', now())::date, greatest(p_tokens, 0), greatest(p_cost, 0))
  on conflict (user_id, period) do update
    set tokens_used = public.usage_monthly.tokens_used + excluded.tokens_used,
        cost_usd = public.usage_monthly.cost_usd + excluded.cost_usd;
$$;

revoke execute on function public.consume_generation_quota(uuid) from public, anon, authenticated;
revoke execute on function public.record_ai_usage(uuid, bigint, numeric) from public, anon, authenticated;
grant execute on function public.consume_generation_quota(uuid) to service_role;
grant execute on function public.record_ai_usage(uuid, bigint, numeric) to service_role;

-- Le client peut relancer le traitement d'un document en échec
grant update (status) on public.documents to authenticated;
create or replace function public.guard_document_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Côté client, seul le passage "failed" -> "uploaded" (réessayer) est permis
  if new.status is distinct from old.status
     and current_user = 'authenticated'
     and not (old.status = 'failed' and new.status = 'uploaded') then
    raise exception 'Changement de statut non autorisé' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger documents_guard_status
  before update of status on public.documents
  for each row execute function public.guard_document_status();
