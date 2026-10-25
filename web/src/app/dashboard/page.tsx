import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Mon espace" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const period = `${new Date().toISOString().slice(0, 7)}-01`;
  const [profileRes, usageRes, limitsRes] = await Promise.all([
    supabase.from("profiles").select("display_name, school_level, plan").eq("id", user.id).maybeSingle(),
    supabase.from("usage_monthly").select("documents_count").eq("user_id", user.id).eq("period", period).maybeSingle(),
    supabase.from("plan_limits").select("plan, max_documents_per_month"),
  ]);

  const profile = profileRes.data;
  const plan = profile?.plan ?? "free";
  const used = usageRes.data?.documents_count ?? 0;
  const limit = limitsRes.data?.find((l) => l.plan === plan)?.max_documents_per_month ?? 0;
  const name = profile?.display_name || user.email?.split("@")[0] || "toi";

  return (
    <main className="page">
      <header className="topbar">
        <a href="/dashboard" className="brand">
          <img src="/logo-mark.png" alt="" width={40} height={36} />
          Revi-zon
        </a>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn btn-ghost btn-inline">
            Se déconnecter
          </button>
        </form>
      </header>

      <section className="stack" style={{ gap: 8 }}>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)" }}>
          Salut <span className="mark">{name}</span>
        </h1>
        <p className="muted">{user.email}</p>
      </section>

      {profileRes.error && (
        <p className="notice error">
          Impossible de lire ton profil. La base de données n'est peut-être pas encore installée sur le projet Supabase.
        </p>
      )}

      <div className="grid-2">
        <section className="card stack">
          <div className="topbar">
            <h2 style={{ fontSize: "1.3rem" }}>Ce mois-ci</h2>
            <span className="pill">{plan === "pro" ? "Pro" : "Gratuit"}</span>
          </div>
          <p className="stat">
            {used} / {limit}
          </p>
          <p className="muted">documents importés</p>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${limit ? Math.min(100, (used / limit) * 100) : 0}%` }} />
          </div>
          <p className="notice">L'import de cours et la génération d'exercices arrivent dans la prochaine étape.</p>
        </section>

        <section className="card stack">
          <h2 style={{ fontSize: "1.3rem" }}>Ton profil</h2>
          <p className="muted">Ton niveau aide l'IA à adapter la difficulté des exercices.</p>
          <ProfileForm displayName={profile?.display_name ?? ""} schoolLevel={profile?.school_level ?? ""} />
        </section>
      </div>
    </main>
  );
}
