import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { visitorCurrency } from "@/lib/currency";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bienvenue" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");

  const [profileRes, limitsRes] = await Promise.all([
    supabase.from("profiles").select("display_name, plan, onboarding_completed").eq("id", user.id).maybeSingle(),
    supabase.from("plan_limits").select("plan, max_documents_per_month, max_file_size_mb"),
  ]);
  const profile = profileRes.data as { display_name: string | null; plan: string; onboarding_completed: boolean } | null;
  if (profile?.onboarding_completed) redirect("/dashboard");

  // Réponses données avant l'inscription (/commencer), gardées sur le compte
  const fromMeta = (user.user_metadata as { onboarding?: unknown } | null)?.onboarding;
  const answersFromSignup = fromMeta && typeof fromMeta === "object" ? (fromMeta as Record<string, string | string[]>) : null;

  const limits = (limitsRes.data ?? []) as { plan: string; max_documents_per_month: number; max_file_size_mb: number }[];
  const free = limits.find((l) => l.plan === "free");
  const pro = limits.find((l) => l.plan === "pro");

  return (
    <main className="ob-page">
      <a href="/" className="brand ob-brand">
        <img src="/logo-mark.png" alt="" width={32} height={29} />
        Revizuno
      </a>
      <OnboardingFlow
        mode="app"
        initialAnswers={answersFromSignup}
        initialName={profile?.display_name ?? ""}
        isPro={profile?.plan === "pro"}
        currency={await visitorCurrency()}
        limits={{ freeDocs: free?.max_documents_per_month ?? 3, proDocs: pro?.max_documents_per_month ?? 200, freeMb: free?.max_file_size_mb ?? 10, proMb: pro?.max_file_size_mb ?? 25 }}
      />
    </main>
  );
}
