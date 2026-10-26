-- Revi-zon : abonnement Pro via Stripe
-- Les colonnes de facturation sont écrites uniquement par les Edge Functions
-- (clé secrète) ; l'étudiant peut seulement les lire sur son propre profil.

alter table public.profiles
  add column stripe_customer_id text unique,
  add column subscription_status text,
  add column subscription_period_end timestamptz,
  add column subscription_cancel_at_period_end boolean not null default false;

-- Pas de droit d'écriture côté client sur ces colonnes : les grants existants
-- (display_name, school_level, locale, onboarding_completed) restent inchangés.
