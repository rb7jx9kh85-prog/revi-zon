# Base de données Revi-zon (Supabase)

Projet Supabase : `czspzlnqmitrcyweknwm`

## Migrations

À appliquer dans l'ordre :

| Fichier | Contenu |
|---|---|
| `migrations/20261025120000_core_schema.sql` | Tables, types, contraintes, index, quotas, répétition espacée |
| `migrations/20261025120100_row_level_security.sql` | Droits d'accès : chaque étudiant ne voit que ses données |
| `migrations/20261025120200_storage.sql` | Bucket privé `documents` et ses règles |

## Modèle de données

```
auth.users ──1:1── profiles ──< subjects
                       │            │ (optionnel)
                       └──< documents ──< document_chunks   (texte découpé + embeddings)
                                 │
                                 ├──< generations          (appels IA : tokens, coût, statut)
                                 ├──< exercises            (flashcard | cloze | quiz, contenu JSON validé)
                                 │        ├──< attempts     (réponses, note 0-5)
                                 │        └──1 review_schedule (prochaine révision, SM-2)
                                 └──< revision_sheets      (fiches en Markdown)

plan_limits (free / pro)   usage_monthly (compteurs par mois)   subject_progress (vue)
```

### Qui écrit quoi

- **L'app (clé `anon` + utilisateur connecté)** : profil (nom, niveau, langue), matières, documents (titre, matière, fichier), réponses via `rpc('record_attempt')`, suppression d'exercices et de fiches.
- **Le serveur (Edge Functions avec la clé `service_role`)** : texte extrait, passages, embeddings, générations, exercices, fiches, statut des documents, plan de l'utilisateur.
- **Automatique** : profil créé à l'inscription, quota vérifié à chaque import, chaque nouvel exercice planifié pour révision.

### Formats d'exercices (`exercises.content`)

```json
{"front": "Où a lieu la photosynthèse ?", "back": "Dans les chloroplastes"}
{"text": "La {{1}} capte la lumière.", "answers": ["chlorophylle"]}
{"question": "Gaz libéré ?", "options": ["CO2", "O2", "N2"], "correct_index": 1, "explanation": "..."}
```

### Fichiers

Bucket privé `documents`, chemin obligatoire : `<user_id>/<document_id>/<nom du fichier>`.
PDF, images (JPEG, PNG, WebP, HEIC), Word, PowerPoint, texte. 25 Mo max.

### Quotas (`plan_limits`)

| Plan | Documents / mois | Générations / mois | Taille max |
|---|---|---|---|
| free | 3 | 30 | 10 Mo |
| pro | 200 | 2000 | 25 Mo |

## Tests

```bash
bash supabase/tests/run_local.sh
```

Lance un Postgres 16 temporaire, une imitation minimale de Supabase (`tests/supabase_stub.sql`), applique les migrations et vérifie : isolation entre deux comptes, colonnes protégées, quotas, validation des exercices, algorithme SM-2, accès anonyme refusé, stockage par dossier, suppressions en cascade.

## Appliquer sur le projet Supabase

- **Avec Claude** : connecter Supabase sur https://claude.ai/customize/connectors, puis ouvrir une nouvelle session.
- **Depuis l'éditeur SQL du dashboard** : coller les 3 fichiers de `migrations/` dans l'ordre et exécuter.
- **Avec la CLI** (sur ton ordinateur) :
  ```bash
  npx supabase login
  npx supabase link --project-ref czspzlnqmitrcyweknwm
  npx supabase db push
  ```
