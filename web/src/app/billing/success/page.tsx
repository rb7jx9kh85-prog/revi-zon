import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlanWatcher } from "@/components/plan-watcher";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bienvenue dans Pro" };

export default async function BillingSuccessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/billing/success");

  const { data } = await supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle();
  // Abonnement confirmé : direction le tableau de bord (avec confettis)
  if (data?.plan === "pro") redirect("/dashboard?welcome=pro");

  return (
    <main className="shell">
      <section className="card stack" style={{ width: "min(100%, 480px)", textAlign: "center", justifyItems: "center" }}>
        <img src="/logo-mark.png" alt="" width={64} height={58} />
        <h1 style={{ fontSize: "1.8rem" }}>Paiement reçu, activation en cours…</h1>
        <p className="muted">Ça prend quelques secondes. Tu arriveras ensuite directement sur ton tableau de bord.</p>
        <PlanWatcher />
        <Link href="/dashboard" className="link-btn">
          Aller au tableau de bord
        </Link>
      </section>
    </main>
  );
}
