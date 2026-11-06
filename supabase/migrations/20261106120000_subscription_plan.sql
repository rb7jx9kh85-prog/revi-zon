-- Revizuno : offre souscrite (lookup key du prix Stripe, ex. revizuno_pro_semester_chf).
-- Écrite par le webhook Stripe ; l'étudiant la lit sur son propre profil.

alter table public.profiles add column subscription_plan text;
