import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { StudyDocument } from "@/lib/types";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Mes cours" };

const STATUS_LABEL: Record<StudyDocument["status"], string> = {
  uploaded: "En attente",
  processing: "En préparation",
  ready: "Prêt",
  failed: "Échec",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const period = `${new Date().toISOString().slice(0, 7)}-01`;
  const [profileRes, usageRes, limitsRes, docsRes] = await Promise.all([
    supabase.from("profiles").select("display_name, school_level, plan").eq("id", user.id).maybeSingle(),
    supabase.from("usage_monthly").select("documents_count").eq("user_id", user.id).eq("period", period).maybeSingle(),
    supabase.from("plan_limits").select("plan, max_documents_per_month"),
    supabase
      .from("documents")
      .select("id, title, status, source, summary, error_message, suggested_questions, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const profile = profileRes.data as { display_name: string | null; school_level: string | null; plan: string } | null;
  const plan = profile?.plan ?? "free";
  const used = (usageRes.data as { documents_count: number } | null)?.documents_count ?? 0;
  const limit =
    ((limitsRes.data ?? []) as { plan: string; max_documents_per_month: number }[]).find((l) => l.plan === plan)
      ?.max_documents_per_month ?? 0;
  const docs = (docsRes.data ?? []) as StudyDocument[];
  const name = profile?.display_name || user.email?.split("@")[0] || "toi";
  const canAdd = used < limit;

  return (
    <main className="page">
      <header className="topbar">
        <Link href="/dashboard" className="brand">
          <img src="/logo-mark.png" alt="" width={40} height={36} />
          Revi-zon
        </Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn btn-ghost btn-inline">
            Se déconnecter
          </button>
        </form>
      </header>

      <section className="topbar">
        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)" }}>
            Salut <span className="mark">{name}</span>
          </h1>
          <p className="muted">Qu'est-ce qu'on révise aujourd'hui ?</p>
        </div>
        {canAdd ? (
          <Link href="/dashboard/new" className="btn btn-primary btn-inline">
            + Nouveau cours
          </Link>
        ) : (
          <span className="notice">Limite de {limit} cours atteinte ce mois-ci</span>
        )}
      </section>

      {profileRes.error && (
        <p className="notice error">Impossible de lire ton profil. Réessaie dans un instant.</p>
      )}

      <section className="stack">
        <h2 style={{ fontSize: "1.4rem" }}>Mes cours</h2>
        {docs.length === 0 ? (
          <Link href="/dashboard/new" className="card empty-course">
            <strong>Importe ton premier cours</strong>
            <span className="muted">PDF, photo du tableau ou notes : Revi en fait des exercices en moins d'une minute.</span>
          </Link>
        ) : (
          <div className="course-grid">
            {docs.map((d) => (
              <Link key={d.id} href={`/study/${d.id}`} className="course-card">
                <span className={`status-pill ${d.status}`}>{STATUS_LABEL[d.status]}</span>
                <strong>{d.title}</strong>
                {d.summary ? <span className="muted clamp">{d.summary}</span> : null}
                <span className="muted small">{new Date(d.created_at).toLocaleDateString("fr-CH", { day: "numeric", month: "long" })}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid-2">
        <section className="card stack">
          <div className="topbar">
            <h2 style={{ fontSize: "1.3rem" }}>Ce mois-ci</h2>
            <span className="pill">{plan === "pro" ? "Pro" : "Gratuit"}</span>
          </div>
          <p className="stat">
            {used} / {limit}
          </p>
          <p className="muted">cours importés</p>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${limit ? Math.min(100, (used / limit) * 100) : 0}%` }} />
          </div>
        </section>

        <section className="card stack">
          <h2 style={{ fontSize: "1.3rem" }}>Ton profil</h2>
          <p className="muted">Ton niveau aide Revi à adapter la difficulté des exercices.</p>
          <ProfileForm displayName={profile?.display_name ?? ""} schoolLevel={profile?.school_level ?? ""} />
        </section>
      </div>
    </main>
  );
}
