import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BillingButton } from "@/components/billing-button";
import { PlannerBoard } from "@/components/dashboard/planner-board";
import { WelcomePro } from "@/components/dashboard/welcome-pro";
import { SiteFooter } from "@/components/site-footer";
import { createClient } from "@/lib/supabase/server";
import type { StudyDocument, StudySession } from "@/lib/types";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Tableau de bord" };

const STATUS_LABEL: Record<StudyDocument["status"], string> = {
  uploaded: "En attente",
  processing: "En préparation",
  ready: "Prêt",
  failed: "Échec",
};

const TZ = "Europe/Zurich";
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const zurichDay = (d: Date) => DAY.format(d);

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("fr-CH", { timeZone: TZ, hour: "numeric", hour12: false }).format(new Date()));
  if (hour < 5) return "Encore debout ? Une petite session et au lit.";
  if (hour < 12) return "Bien dormi ? Ton cerveau est au top le matin.";
  if (hour < 18) return "Qu'est-ce qu'on révise aujourd'hui ?";
  return "Une session ce soir, et c'est gravé pour demain.";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const period = `${new Date().toISOString().slice(0, 7)}-01`;
  const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
  const sessionsSince = new Date(Date.now() - 62 * 86_400_000).toISOString();
  const [profileRes, usageRes, limitsRes, docsRes, attemptsRes, exercisesRes, scheduleRes, sessionsRes] = await Promise.all([
    supabase.from("profiles").select("display_name, school_level, plan").eq("id", user.id).maybeSingle(),
    supabase.from("usage_monthly").select("documents_count").eq("user_id", user.id).eq("period", period).maybeSingle(),
    supabase.from("plan_limits").select("plan, max_documents_per_month"),
    supabase
      .from("documents")
      .select("id, title, status, source, summary, error_message, suggested_questions, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("attempts").select("created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
    supabase.from("exercises").select("id, document_id"),
    supabase.from("review_schedule").select("exercise_id, repetitions, due_at"),
    supabase.from("study_sessions").select("id, document_id, title, starts_at, duration_min, done").gte("starts_at", sessionsSince).order("starts_at"),
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

  // Activité par jour (fuseau de Zurich)
  const activity: Record<string, number> = {};
  for (const a of (attemptsRes.data ?? []) as { created_at: string }[]) {
    const k = zurichDay(new Date(a.created_at));
    activity[k] = (activity[k] ?? 0) + 1;
  }
  let streak = 0;
  const cursor = new Date();
  if (!activity[zurichDay(cursor)]) cursor.setTime(cursor.getTime() - 86_400_000); // la série tient jusqu'à ce soir
  while (activity[zurichDay(cursor)]) {
    streak += 1;
    cursor.setTime(cursor.getTime() - 86_400_000);
  }
  const weekAgo = Date.now() - 7 * 86_400_000;
  const weekCount = ((attemptsRes.data ?? []) as { created_at: string }[]).filter((a) => new Date(a.created_at).getTime() >= weekAgo).length;

  // Progression par cours
  const schedule = new Map(((scheduleRes.data ?? []) as { exercise_id: string; repetitions: number; due_at: string }[]).map((s) => [s.exercise_id, s]));
  const perDoc = new Map<string, { total: number; mastered: number; due: number }>();
  for (const e of (exercisesRes.data ?? []) as { id: string; document_id: string }[]) {
    const stat = perDoc.get(e.document_id) ?? { total: 0, mastered: 0, due: 0 };
    const s = schedule.get(e.id);
    stat.total += 1;
    if (s && s.repetitions >= 2) stat.mastered += 1;
    if (!s || new Date(s.due_at).getTime() <= Date.now()) stat.due += 1;
    perDoc.set(e.document_id, stat);
  }
  const totals = [...perDoc.values()].reduce((acc, s) => ({ total: acc.total + s.total, mastered: acc.mastered + s.mastered, due: acc.due + s.due }), { total: 0, mastered: 0, due: 0 });
  const mastery = totals.total ? Math.round((totals.mastered / totals.total) * 100) : 0;
  const readyDocs = docs.filter((d) => d.status === "ready");
  const resume = readyDocs
    .map((d) => ({ doc: d, stat: perDoc.get(d.id) ?? { total: 0, mastered: 0, due: 0 } }))
    .filter((x) => x.stat.due > 0)
    .sort((a, b) => b.stat.due - a.stat.due)[0];
  const sessions = (sessionsRes.data ?? []) as StudySession[];

  return (
    <main className="page wide">
      <header className="topbar">
        <Link href="/dashboard" className="brand">
          <img src="/logo-mark.png" alt="" width={40} height={36} />
          Revi-zon
        </Link>
        <nav className="top-links">
          <Link href="/studio" className="top-link">
            Studio Revi
          </Link>
          {plan !== "pro" ? (
            <Link href="/pricing" className="top-link">
              Offre Pro
            </Link>
          ) : null}
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn btn-ghost btn-inline">
              Se déconnecter
            </button>
          </form>
        </nav>
      </header>

      {welcome === "pro" && plan === "pro" ? <WelcomePro /> : null}

      <section className="hero-row fade-up">
        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)" }}>
            Salut <span className="mark">{name}</span> <span className="wave">👋</span>
          </h1>
          <p className="muted">{greeting()}</p>
        </div>
        <div className="row-center" style={{ justifyContent: "flex-end" }}>
          <Link href="/studio" className="btn btn-ghost btn-inline">
            Demander à Revi
          </Link>
          {canAdd ? (
            <Link href="/dashboard/new" className="btn btn-primary btn-inline">
              + Nouveau cours
            </Link>
          ) : (
            <Link href="/pricing" className="notice">
              Limite de {limit} cours atteinte ce mois-ci · <strong>Passer à Pro</strong>
            </Link>
          )}
        </div>
      </section>

      {profileRes.error && <p className="notice error">Impossible de lire ton profil. Réessaie dans un instant.</p>}

      <section className="kpi-grid stagger">
        <div className="card kpi">
          <span className={`kpi-ico flame ${streak ? "lit" : ""}`} aria-hidden="true">
            🔥
          </span>
          <span className="stat">{streak}</span>
          <span className="muted">jour{streak > 1 ? "s" : ""} d'affilée</span>
        </div>
        <div className="card kpi">
          <span className="kpi-ico" aria-hidden="true">
            ⚡
          </span>
          <span className="stat">{weekCount}</span>
          <span className="muted">révisions cette semaine</span>
        </div>
        <div className="card kpi">
          <span className="kpi-ico" aria-hidden="true">
            ⏰
          </span>
          <span className="stat">{totals.due}</span>
          <span className="muted">à revoir aujourd'hui</span>
        </div>
        <div className="card kpi">
          <span className="ring" style={{ "--p": mastery } as React.CSSProperties} aria-hidden="true" />
          <span className="stat">{mastery}%</span>
          <span className="muted">maîtrisé au total</span>
        </div>
      </section>

      {resume ? (
        <Link href={`/study/${resume.doc.id}/flashcards`} className="resume-card fade-up">
          <span className="kicker">À reprendre</span>
          <strong>{resume.doc.title}</strong>
          <span>
            {resume.stat.due} exercice{resume.stat.due > 1 ? "s" : ""} à revoir · environ {Math.max(5, Math.round(resume.stat.due * 0.5))} min
          </span>
          <span className="resume-go">Réviser maintenant →</span>
        </Link>
      ) : null}

      <div className="dash-grid">
        <PlannerBoard activity={activity} sessions={sessions} courses={readyDocs.map((d) => ({ id: d.id, title: d.title }))} />

        <div className="stack" style={{ gap: 20, alignContent: "start" }}>
          <Link href="/studio" className="studio-promo">
            <span className="revi-avatar big" aria-hidden="true">
              R
            </span>
            <strong>Studio Revi</strong>
            <span>Ton tuteur IA en plein écran : explications, quiz express, planning. Il connaît tous tes cours.</span>
            <span className="resume-go">Ouvrir le Studio →</span>
          </Link>

          <section className="card stack">
            <div className="topbar">
              <h2 style={{ fontSize: "1.2rem" }}>Ce mois-ci</h2>
              <span className="pill">{plan === "pro" ? "Pro" : "Gratuit"}</span>
            </div>
            <p className="stat">
              {used} / {limit}
            </p>
            <p className="muted">cours importés</p>
            <div className="meter" aria-hidden="true">
              <span style={{ width: `${limit ? Math.min(100, (used / limit) * 100) : 0}%` }} />
            </div>
            {plan === "pro" ? (
              <BillingButton action="portal" label="Gérer mon abonnement" className="btn btn-ghost" />
            ) : (
              <Link href="/pricing" className="btn btn-primary">
                Passer à Pro
              </Link>
            )}
          </section>
        </div>
      </div>

      <section className="stack">
        <div className="topbar">
          <h2 style={{ fontSize: "1.4rem" }}>Mes cours</h2>
          <span className="muted small">
            {docs.length} cours · {totals.total} exercices
          </span>
        </div>
        {docs.length === 0 ? (
          <Link href="/dashboard/new" className="card empty-course">
            <strong>Importe ton premier cours</strong>
            <span className="muted">PDF, photo du tableau ou notes : Revi en fait des exercices en moins d'une minute.</span>
          </Link>
        ) : (
          <div className="course-grid stagger">
            {docs.map((d) => {
              const stat = perDoc.get(d.id);
              const pct = stat?.total ? Math.round((stat.mastered / stat.total) * 100) : 0;
              return (
                <Link key={d.id} href={`/study/${d.id}`} className="course-card">
                  <div className="topbar" style={{ gap: 8 }}>
                    <span className={`status-pill ${d.status}`}>{STATUS_LABEL[d.status]}</span>
                    {stat?.due ? <span className="due-badge">{stat.due} à revoir</span> : null}
                  </div>
                  <strong>{d.title}</strong>
                  {d.summary ? <span className="muted clamp">{d.summary}</span> : null}
                  {d.status === "ready" ? (
                    <div className="course-progress">
                      <div className="meter thin" aria-hidden="true">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <span className="small">{pct}% maîtrisé</span>
                    </div>
                  ) : null}
                  <span className="muted small">{new Date(d.created_at).toLocaleDateString("fr-CH", { day: "numeric", month: "long", timeZone: TZ })}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: "1.3rem" }}>Ton profil</h2>
        <p className="muted">Ton niveau aide Revi à adapter la difficulté des exercices et ses explications.</p>
        <ProfileForm displayName={profile?.display_name ?? ""} schoolLevel={profile?.school_level ?? ""} />
      </section>
      <SiteFooter />
    </main>
  );
}
