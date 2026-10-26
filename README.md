# Revi-zon

Application de révision propulsée par l'IA : l'étudiant importe ses cours (PDF, photos, notes) et l'app génère des flashcards, des textes à trous, des quiz et des fiches de révision adaptés à son niveau.

## Contenu du repo

- `web/` : l'app web Next.js, landing comprise (`web/public/landing/`). Connexion, import de cours, révision, offre Pro. Voir `web/README.md`.
- `supabase/` : base de données (migrations, tests) et Edge Functions (IA, paiement). Voir `supabase/README.md`.

## Lancer en local

```bash
cd web
cp .env.example .env.local
npm install
npm run dev   # http://localhost:3000 (landing) et /dashboard (app)
```
