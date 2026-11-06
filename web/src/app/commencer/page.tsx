import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { visitorCurrency } from "@/lib/currency";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Commencer",
  description: "Réponds à quelques questions : Revizuno prépare ton programme de révision personnalisé.",
};

// Questionnaire avant l'inscription : le compte est créé à la fin.
export default async function StartPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="ob-page">
      <a href="/" className="brand ob-brand">
        <img src="/logo-mark.png" alt="" width={32} height={29} />
        Revizuno
      </a>
      <OnboardingFlow
        mode="public"
        initialAnswers={null}
        initialName=""
        isPro={false}
        currency={await visitorCurrency()}
        limits={{ freeDocs: 3, proDocs: 200, freeMb: 10, proMb: 25 }}
      />
    </main>
  );
}
