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
  const isPro = data?.plan === "pro";

  return (
    <main className="shell">
      <section className="card stack" style={{ width: "min(100%, 480px)", textAlign: "center", justifyItems: "center" }}>
        <img src="/logo-mark.png" alt="" width={64} height={58} />
        {isPro ? (
          <>
            <h1 style={{ fontSize: "2rem" }}>
              Tu es <span className="mark">Pro</span> !
            </h1>
            <p className="muted">Merci pour ton soutien. Tes nouvelles limites sont actives tout de suite.</p>
            <Link href="/dashboard/new" className="btn btn-primary">
              Importer un cours
            </Link>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: "1.8rem" }}>Paiement reçu, activation en cours…</h1>
            <p className="muted">Ça prend quelques secondes. Cette page se met à jour toute seule.</p>
            <PlanWatcher />
            <Link href="/dashboard" className="link-btn">
              Aller à mes cours
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
