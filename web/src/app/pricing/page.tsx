import type { Metadata } from "next";
import Link from "next/link";
import { BillingButton } from "@/components/billing-button";
import { PRO_PRICE_LABEL, PRO_PRICE_PERIOD } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Offre Pro" };

type Limits = { plan: string; max_documents_per_month: number; max_generations_per_month: number; max_file_size_mb: number };

const FALLBACK: Limits[] = [
  { plan: "free", max_documents_per_month: 3, max_generations_per_month: 30, max_file_size_mb: 10 },
  { plan: "pro", max_documents_per_month: 200, max_generations_per_month: 2000, max_file_size_mb: 25 },
];

function Check() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ canceled?: string }> }) {
  const { canceled } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Les limites ne sont lisibles qu'une fois connecté : valeurs par défaut sinon
  let limits = FALLBACK;
  let plan: string | null = null;
  if (user) {
    const [{ data: l }, { data: p }] = await Promise.all([
      supabase.from("plan_limits").select("plan, max_documents_per_month, max_generations_per_month, max_file_size_mb"),
      supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle(),
    ]);
    if (l && l.length) limits = l as Limits[];
    plan = (p?.plan as string | undefined) ?? "free";
  }
  const free = limits.find((l) => l.plan === "free") ?? FALLBACK[0];
  const pro = limits.find((l) => l.plan === "pro") ?? FALLBACK[1];

  return (
    <main className="page">
      <header className="topbar">
        <Link href="/" className="brand">
          <img src="/logo-mark.png" alt="" width={40} height={36} />
          Revi-zon
        </Link>
        <Link href={user ? "/dashboard" : "/login"} className="btn btn-ghost btn-inline">
          {user ? "Mes cours" : "Connexion"}
        </Link>
      </header>

      <section className="stack" style={{ gap: 10, textAlign: "center", justifyItems: "center" }}>
        <h1 style={{ fontSize: "clamp(2.2rem, 6vw, 3.6rem)" }}>
          Révise sans <span className="mark">limite.</span>
        </h1>
        <p className="muted" style={{ maxWidth: "34em" }}>
          Commence gratuitement. Passe à Pro quand tu as plus de cours à réviser. Sans engagement, résiliable en un clic.
        </p>
      </section>

      {canceled && <p className="notice">Paiement annulé : aucun montant n'a été débité.</p>}

      <section className="plans">
        <article className="card stack plan">
          <h2>Gratuit</h2>
          <p className="price">
            0 CHF <small>pour toujours</small>
          </p>
          <ul className="plan-list">
            <li><Check />{free.max_documents_per_month} cours importés par mois</li>
            <li><Check />Flashcards, quiz, textes à trous et fiches</li>
            <li><Check />Tuteur Revi sur chaque cours</li>
            <li><Check />Fichiers jusqu'à {free.max_file_size_mb} Mo</li>
          </ul>
          {user ? (
            <Link href="/dashboard" className="btn btn-ghost">
              {plan === "free" ? "Ton plan actuel" : "Aller à mes cours"}
            </Link>
          ) : (
            <Link href="/login?next=/dashboard/new" className="btn btn-ghost">
              Créer mon compte
            </Link>
          )}
        </article>

        <article className="card stack plan pro">
          <span className="plan-badge">Recommandé</span>
          <h2>Pro</h2>
          <p className="price">
            {PRO_PRICE_LABEL} <small>{PRO_PRICE_PERIOD}</small>
          </p>
          <ul className="plan-list">
            <li><Check />{pro.max_documents_per_month} cours importés par mois</li>
            <li><Check />{pro.max_generations_per_month} générations d'exercices par mois</li>
            <li><Check />Fichiers jusqu'à {pro.max_file_size_mb} Mo</li>
            <li><Check />Tout le plan gratuit, sans attendre le mois suivant</li>
          </ul>
          {!user ? (
            <Link href="/login?next=/pricing" className="btn btn-primary">
              Passer à Pro
            </Link>
          ) : plan === "pro" ? (
            <BillingButton action="portal" label="Gérer mon abonnement" />
          ) : (
            <BillingButton action="checkout" label="Passer à Pro" />
          )}
          <p className="muted small">Paiement sécurisé par Stripe. Carte, Apple Pay ou Google Pay.</p>
        </article>
      </section>
    </main>
  );
}
