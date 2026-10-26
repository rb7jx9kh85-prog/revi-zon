-- Revizuno : réponses au questionnaire d'accueil (âge, temps par jour, objectif…)
-- utilisées pour personnaliser le programme et l'offre Pro.

alter table public.profiles add column onboarding_answers jsonb;

grant update (onboarding_answers) on public.profiles to authenticated;
