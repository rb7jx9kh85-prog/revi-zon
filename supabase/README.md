# Base de données Revizuno (Supabase)

Projet Supabase : `czspzlnqmitrcyweknwm`

## Migrations

À appliquer dans l'ordre :

| Fichier | Contenu |
|---|---|
| `migrations/20261025120000_core_schema.sql` | Tables, types, contraintes, index, quotas, répétition espacée |
| `migrations/20261025120100_row_level_security.sql` | Droits d'accès : chaque étudiant ne voit que ses données |
| `migrations/20261025120200_storage.sql` | Bucket privé `documents` et ses règles |
| `migrations/20261025140000_ai_pipeline.sql` | Génération IA : type `study_set`, colonnes du document (fichier OpenAI, résumé, questions suggérées), quota de générations, suivi des coûts, relance d'un document en échec |

| `migrations/20261026090000_billing.sql` | Abonnement Stripe sur le profil : client, statut, fin de période (écrits uniquement par le serveur) |

Les 5 migrations sont appliquées sur le projet.

## Edge Functions (`functions/`)

| Fonction | Rôle |
|---|---|
| `process-document` | `POST { document_id }`. Vérifie l'utilisateur et le quota, puis en arrière-plan envoie le cours à OpenAI (PDF via l'API Files, image en base64, texte brut) et enregistre fiche, exercices validés, coût et statut. |
| `chat` | `POST { document_id, messages }`. Tuteur « Revi » qui répond à partir de la fiche et du cours. |
| `billing` | `POST { action: "checkout" \| "portal" }`. Crée la session de paiement Stripe ou le lien du portail d'abonnement. |
| `stripe-webhook` | Reçoit les événements Stripe (signature vérifiée) et passe le profil en `pro` ou `free`. |

Les deux sont déployées avec `verify_jwt = false` et vérifient elles-mêmes le jeton de l'utilisateur
(compatible avec les nouvelles clés publishable / secret ; `stripe-webhook` vérifie la signature Stripe).
Secrets requis : `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`.

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
