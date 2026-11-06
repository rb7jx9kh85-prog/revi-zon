# App web Revizuno (Next.js + Supabase)

Espace étudiant : connexion, import de cours, révision avec flashcards, quiz, textes à trous, fiche et tuteur IA.

## Ce qui marche

- **Landing** (`/`) : la page d'accueil (`public/landing/index.html`) est servie par l'app. Ses boutons mènent à l'inscription (`/dashboard/new`), à la connexion et à l'offre Pro.
- **Offre Pro** (`/pricing`) : gratuit vs Pro, paiement Stripe Checkout, portail Stripe pour gérer ou résilier. Retour sur `/billing/success`, qui attend la confirmation de Stripe.
- **Connexion sans mot de passe** (lien magique par e-mail) et **avec Google**. Le compte est créé à la première connexion.
- **Mes cours** (`/dashboard`) : liste des cours, quota du mois, profil (prénom, niveau d'études).
- **Import** (`/dashboard/new`) : PDF, photo (JPG, PNG, WebP) ou texte collé.
- **Préparation par l'IA** : la fonction `process-document` génère fiche, flashcards, textes à trous, quiz et questions suggérées. La page suit l'avancement et propose de réessayer en cas d'échec.
- **Set de révision** (`/study/[id]`) :
  - Vue d'ensemble : résumé, maîtrise, exercices à revoir.
  - Flashcards : retourner (Espace), « À revoir » / « Je savais » (← / →).
  - Quiz : 4 options, touches 1-4, correction et explication.
  - Textes à trous : saisie dans la phrase, indice, correction tolérante (accents, majuscules).
  - Fiche de révision en Markdown.
  - Chat « Demande à Revi » à droite (tiroir sur mobile).
- **Répétition espacée** : chaque réponse est notée (SM-2) et les exercices à revoir passent en premier.

## Lancer en local

```bash
cd web
cp .env.example .env.local   # puis colle ta clé publique Supabase
npm install
npm run dev                  # http://localhost:3000
```

## Mise en ligne

### 1. Supabase (dashboard du projet `czspzlnqmitrcyweknwm`)

1. **Base de données** : déjà installée (5 migrations, voir `supabase/README.md`).
2. **Authentication > URL Configuration**
   - Site URL : `https://www.revizuno.com`
   - Redirect URLs : ajouter
     - `https://www.revizuno.com/**` et `https://revizuno.com/**`
     - `https://*-<ton-compte>.vercel.app/auth/callback` (prévisualisations Vercel)
     - `http://localhost:3000/auth/callback`
3. **Authentication > Sign In / Providers**
   - Email : activé (le lien magique est inclus).
   - Google : activer, puis coller le Client ID et le Client Secret créés dans Google Cloud Console
     (APIs & Services > Credentials > OAuth client ID > Web application).
     Dans Google, « Authorized redirect URI » = `https://czspzlnqmitrcyweknwm.supabase.co/auth/v1/callback`.
4. **Project Settings > API** : copier l'URL du projet et la clé publique (`publishable` ou `anon`).

### 2. Clé OpenAI (obligatoire pour l'IA)

Supabase > Edge Functions > Secrets, ajouter :

- `OPENAI_API_KEY` = ta clé OpenAI (platform.openai.com > API keys)
- optionnel : `OPENAI_MODEL` (par défaut `gpt-4.1-mini`), `OPENAI_CHAT_MODEL`,
  `OPENAI_PRICE_INPUT_PER_M` / `OPENAI_PRICE_OUTPUT_PER_M` (prix par million de tokens, pour le suivi des coûts)

Pas besoin de redéployer : les fonctions lisent les secrets à chaque appel.

### 3. Paiement Stripe

Trois offres Pro, chacune en EUR (France et ailleurs) et en CHF (Suisse, Liechtenstein) :

| Offre | Prix | Lookup key EUR | Lookup key CHF |
|---|---|---|---|
| Pro mensuel | 9,99 / mois | `revizuno_pro_monthly_eur` | `revizuno_pro_monthly_chf` |
| Pro semestre (recommandée) | 34,99 / 6 mois | `revizuno_pro_semester_eur` | `revizuno_pro_semester_chf` |
| Pro annuel | 59,99 / an | `revizuno_pro_annual_eur` | `revizuno_pro_annual_chf` |

- Un produit « Revizuno Pro » (code fiscal `txcd_10103000`), six prix récurrents TTC (`tax_behavior: inclusive`)
  retrouvés par leur lookup key : aucun identifiant de prix à recopier.
- La devise est choisie selon le pays du visiteur (en-tête `x-vercel-ip-country`), voir `src/lib/currency.ts`.
  Les montants affichés sont dans `src/lib/pricing.ts` et doivent correspondre aux prix Stripe.
- Webhook vers `https://czspzlnqmitrcyweknwm.supabase.co/functions/v1/stripe-webhook`, événements
  `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
- Portail client activé (résiliation, changement de carte, changement d'offre).
- Supabase > Edge Functions > Secrets : `STRIPE_SECRET_KEY` (`sk_live_…` en production) et `STRIPE_WEBHOOK_SECRET` (`whsec_…`).
  `APP_URL` est optionnel.

### 4. Vercel

Un seul projet sert la landing et l'app : dans le projet existant `revi-zon` (ou un nouveau) :

- Root Directory : `web`
- Framework : Next.js (détecté automatiquement)
- Variables d'environnement :
  - `NEXT_PUBLIC_SUPABASE_URL` = `https://czspzlnqmitrcyweknwm.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = la clé publique

Ne jamais mettre la clé `service_role` dans une variable `NEXT_PUBLIC_*`.
