# App web Revi-zon (Next.js + Supabase)

Espace étudiant : connexion, profil, et bientôt import de cours et révisions.

## Ce qui marche

- **Connexion sans mot de passe** : lien magique par e-mail (le compte est créé à la première connexion).
- **Connexion avec Google.**
- **Pages protégées** : `/dashboard` redirige vers `/login` si on n'est pas connecté.
- **Espace étudiant** : prénom, niveau d'études, plan, documents importés ce mois-ci.
- **Déconnexion.**

## Lancer en local

```bash
cd web
cp .env.example .env.local   # puis colle ta clé publique Supabase
npm install
npm run dev                  # http://localhost:3000
```

## Mise en ligne

### 1. Supabase (dashboard du projet `czspzlnqmitrcyweknwm`)

1. **Base de données** : appliquer les migrations de `supabase/migrations/` (voir `supabase/README.md`).
2. **Authentication > URL Configuration**
   - Site URL : l'adresse de l'app sur Vercel, par ex. `https://app-revi-zon.vercel.app`
   - Redirect URLs : ajouter
     - `https://app-revi-zon.vercel.app/auth/callback`
     - `https://*-<ton-compte>.vercel.app/auth/callback` (prévisualisations Vercel)
     - `http://localhost:3000/auth/callback`
3. **Authentication > Sign In / Providers**
   - Email : activé (le lien magique est inclus).
   - Google : activer, puis coller le Client ID et le Client Secret créés dans Google Cloud Console
     (APIs & Services > Credentials > OAuth client ID > Web application).
     Dans Google, « Authorized redirect URI » = `https://czspzlnqmitrcyweknwm.supabase.co/auth/v1/callback`.
4. **Project Settings > API** : copier l'URL du projet et la clé publique (`publishable` ou `anon`).

### 2. Vercel

Créer un **nouveau projet** depuis le repo `revi-zon` (la landing garde son propre projet) :

- Root Directory : `web`
- Framework : Next.js (détecté automatiquement)
- Variables d'environnement :
  - `NEXT_PUBLIC_SUPABASE_URL` = `https://czspzlnqmitrcyweknwm.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = la clé publique

Ne jamais mettre la clé `service_role` dans une variable `NEXT_PUBLIC_*`.
