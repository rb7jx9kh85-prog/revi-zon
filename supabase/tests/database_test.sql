-- Tests du schéma Revi-zon : isolation entre étudiants, quotas, validation
-- des exercices, répétition espacée et stockage.
-- Lancé par run_local.sh (psql, ON_ERROR_STOP). Chaque bloc échoue bruyamment.

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on

-- Deux étudiants
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'lea@example.ch', '{"full_name": "Léa"}'),
  ('00000000-0000-0000-0000-00000000000b', 'yanis@example.ch', '{}');

do $$ begin
  assert (select count(*) from public.profiles) = 2, 'un profil par compte';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'Léa', 'nom repris des métadonnées';
  assert (select plan from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'free', 'plan gratuit par défaut';
end $$;

-- ---------------------------------------------------------------------------
-- Léa crée une matière et importe un document
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

insert into public.subjects (id, name, color) values ('10000000-0000-0000-0000-000000000001', 'Biologie', '#7CC0FF');
insert into public.documents (id, subject_id, title, source, storage_path, mime_type, size_bytes)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Chapitre 3 : photosynthèse', 'pdf',
        '00000000-0000-0000-0000-00000000000a/20000000-0000-0000-0000-000000000001/bio.pdf', 'application/pdf', 120000);

do $$ begin
  assert (select count(*) from public.documents) = 1, 'Léa voit son document';
  assert (select user_id from public.documents) = '00000000-0000-0000-0000-00000000000a', 'user_id rempli automatiquement';
  assert (select documents_count from public.usage_monthly) = 1, 'import compté dans l''usage';
end $$;

-- Léa ne peut pas se passer en Pro elle-même
do $$ begin
  begin
    update public.profiles set plan = 'pro';
    raise exception 'ÉCHEC : le plan a pu être modifié';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Léa ne peut pas changer le statut de traitement
do $$ begin
  begin
    update public.documents set status = 'ready';
    raise exception 'ÉCHEC : le statut a pu être modifié';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Mauvais chemin de fichier refusé
do $$ begin
  begin
    insert into public.documents (title, source, storage_path) values ('x', 'pdf', 'autre-dossier/x.pdf');
    raise exception 'ÉCHEC : chemin hors du dossier accepté';
  exception when check_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Yanis ne voit rien de Léa et ne peut rien lui faire
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);

do $$
declare n int;
begin
  assert (select count(*) from public.subjects) = 0, 'matières isolées';
  assert (select count(*) from public.documents) = 0, 'documents isolés';
  assert (select count(*) from public.profiles) = 1, 'Yanis ne voit que son profil';
  assert (select count(*) from public.usage_monthly) = 0, 'usage isolé';

  update public.documents set title = 'piraté' where id = '20000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'pas de modification du document de Léa';

  delete from public.subjects where id = '10000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'pas de suppression de la matière de Léa';
end $$;

-- Rattacher un document à la matière de Léa est impossible
do $$ begin
  begin
    insert into public.documents (subject_id, title, source) values ('10000000-0000-0000-0000-000000000001', 'x', 'text');
    raise exception 'ÉCHEC : matière d''un autre compte acceptée';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Créer un document au nom de Léa est impossible
do $$ begin
  begin
    insert into public.documents (user_id, title, source) values ('00000000-0000-0000-0000-00000000000a', 'x', 'text');
    raise exception 'ÉCHEC : user_id imposé accepté';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Quota : 3 documents par mois en gratuit
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.documents (title, source) values ('Doc 2', 'text'), ('Doc 3', 'text');

do $$ begin
  begin
    insert into public.documents (title, source) values ('Doc 4', 'text');
    raise exception 'ÉCHEC : quota dépassé accepté';
  exception when raise_exception then
    assert sqlerrm like 'Quota mensuel de documents atteint%', 'message de quota';
  end;
  assert (select documents_count from public.usage_monthly) = 3, 'usage à 3';
end $$;

-- ---------------------------------------------------------------------------
-- Le serveur (service_role) écrit le contenu généré par l'IA
-- ---------------------------------------------------------------------------
reset role;
set role service_role;

insert into public.generations (id, user_id, document_id, kind, status, model, prompt_tokens, completion_tokens, cost_usd)
values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001',
        'flashcard', 'succeeded', 'gpt-test', 1200, 400, 0.0021);

insert into public.document_chunks (document_id, user_id, chunk_index, content, token_count, page_number)
values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 0, 'La photosynthèse se déroule dans les chloroplastes.', 12, 1);

insert into public.exercises (id, user_id, document_id, generation_id, kind, content) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', 'flashcard', '{"front": "Où a lieu la photosynthèse ?", "back": "Dans les chloroplastes"}'),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001',
   null, 'quiz', '{"question": "Gaz libéré ?", "options": ["CO2", "O2", "N2"], "correct_index": 1, "explanation": "Photolyse de l''eau"}'),
  ('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001',
   null, 'cloze', '{"text": "La {{1}} capte la lumière.", "answers": ["chlorophylle"]}');

insert into public.revision_sheets (user_id, document_id, title, content_md)
values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Photosynthèse, l''essentiel', '# Équation\n6 CO2 + 6 H2O -> C6H12O6 + 6 O2');

do $$ begin
  assert (select count(*) from public.review_schedule) = 3, 'chaque exercice est planifié';

  begin
    insert into public.exercises (user_id, document_id, kind, content)
    values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'quiz',
            '{"question": "?", "options": ["a", "b"], "correct_index": 5}');
    raise exception 'ÉCHEC : quiz invalide accepté';
  exception when check_violation then null;
  end;

  begin
    insert into public.exercises (user_id, document_id, kind, content)
    values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'flashcard', '{"front": "seulement recto"}');
    raise exception 'ÉCHEC : flashcard sans verso acceptée';
  exception when check_violation then null;
  end;

  begin
    insert into public.exercises (user_id, document_id, kind, content)
    values ('00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001', 'flashcard', '{"front": "a", "back": "b"}');
    raise exception 'ÉCHEC : exercice rattaché au document d''un autre compte';
  exception when foreign_key_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Répétition espacée (SM-2)
-- ---------------------------------------------------------------------------
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

do $$
declare s public.review_schedule;
begin
  s := public.record_attempt('40000000-0000-0000-0000-000000000001', 5::smallint, '{"flipped": true}', 3200);
  assert s.repetitions = 1 and s.interval_days = 1, format('1re bonne réponse : %s', row_to_json(s));
  assert s.ease_factor = 2.60, format('facilité augmentée : %s', s.ease_factor);

  s := public.record_attempt('40000000-0000-0000-0000-000000000001', 4::smallint);
  assert s.repetitions = 2 and s.interval_days = 6, format('2e bonne réponse : %s', row_to_json(s));

  s := public.record_attempt('40000000-0000-0000-0000-000000000001', 4::smallint);
  assert s.repetitions = 3 and s.interval_days = 16, format('3e bonne réponse : %s', row_to_json(s));

  s := public.record_attempt('40000000-0000-0000-0000-000000000001', 1::smallint);
  assert s.repetitions = 0 and s.interval_days = 1, format('oubli : %s', row_to_json(s));
  assert s.ease_factor >= 1.30, 'facilité jamais sous 1.3';

  assert (select count(*) from public.attempts) = 4, '4 réponses enregistrées';
  assert (select count(*) filter (where is_correct) from public.attempts) = 3, 'réussite calculée depuis la note';

  begin
    perform public.record_attempt('40000000-0000-0000-0000-000000000002', 9::smallint);
    raise exception 'ÉCHEC : note hors limites acceptée';
  exception when invalid_parameter_value then null;
  end;

  assert (select exercises_total from public.subject_progress) = 3, 'progression : 3 exercices';
  assert (select count(*) from public.exercises) = 3, 'Léa lit ses exercices';
  assert (select count(*) from public.revision_sheets) = 1, 'Léa lit sa fiche';
  assert (select count(*) from public.document_chunks) = 1, 'Léa lit ses passages';
end $$;

-- Léa ne peut pas écrire d'exercice elle-même
do $$ begin
  begin
    insert into public.exercises (user_id, document_id, kind, content)
    values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'flashcard', '{"front": "a", "back": "b"}');
    raise exception 'ÉCHEC : exercice écrit par le client';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Yanis ne peut pas répondre aux exercices de Léa ni les voir
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert (select count(*) from public.exercises) = 0, 'exercices isolés';
  assert (select count(*) from public.attempts) = 0, 'réponses isolées';
  assert (select count(*) from public.review_schedule) = 0, 'planning isolé';
  assert (select count(*) from public.generations) = 0, 'générations isolées';
  assert (select count(*) from public.subject_progress) = 0, 'progression isolée';
  begin
    perform public.record_attempt('40000000-0000-0000-0000-000000000001', 5::smallint);
    raise exception 'ÉCHEC : réponse sur l''exercice d''un autre compte';
  exception when foreign_key_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Visiteur non connecté : aucun accès
-- ---------------------------------------------------------------------------
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin
    perform 1 from public.documents;
    raise exception 'ÉCHEC : lecture anonyme autorisée';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_attempt('40000000-0000-0000-0000-000000000001', 5::smallint);
    raise exception 'ÉCHEC : fonction appelable en anonyme';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Stockage : un dossier par compte
-- ---------------------------------------------------------------------------
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into storage.objects (bucket_id, name) values ('documents', '00000000-0000-0000-0000-00000000000a/20000000-0000-0000-0000-000000000001/bio.pdf');

do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('documents', '00000000-0000-0000-0000-00000000000b/vol.pdf');
    raise exception 'ÉCHEC : upload dans le dossier d''un autre compte';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert (select count(*) from storage.objects) = 0, 'fichiers isolés';
end $$;

-- ---------------------------------------------------------------------------
-- Suppression en cascade
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
delete from public.documents where id = '20000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.exercises) = 0, 'exercices supprimés avec le document';
  assert (select count(*) from public.review_schedule) = 0, 'planning supprimé avec le document';
  assert (select count(*) from public.attempts) = 0, 'réponses supprimées avec le document';
  assert (select count(*) from public.document_chunks) = 0, 'passages supprimés avec le document';
  assert (select count(*) from public.revision_sheets) = 0, 'fiches supprimées avec le document';
end $$;

-- Supprimer une matière garde les documents, sans matière
insert into public.subjects (id, name) values ('10000000-0000-0000-0000-000000000002', 'Histoire');
update public.documents set subject_id = '10000000-0000-0000-0000-000000000002' where title = 'Doc 2';
delete from public.subjects where id = '10000000-0000-0000-0000-000000000002';
do $$ begin
  assert (select subject_id from public.documents where title = 'Doc 2') is null, 'document conservé sans matière';
end $$;

reset role;
\echo 'Tous les tests sont passés.'
