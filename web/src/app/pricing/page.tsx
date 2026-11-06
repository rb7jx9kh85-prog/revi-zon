import type { Metadata } from "next";
import Link from "next/link";
import { BillingButton } from "@/components/billing-button";
import { visitorCurrency } from "@/lib/currency";
import { PLANS, formatPrice, planMath } from "@/lib/pricing";
import { SiteFooter } from "@/components/site-footer";
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
  const currency = await visitorCurrency();
  const free = limits.find((l) => l.plan === "free") ?? FALLBACK[0];
  const pro = limits.find((l) => l.plan === "pro") ?? FALLBACK[1];

  return (
    <main className="page wide">
      <header className="topbar">
        <a href="/" className="brand">
          <img src="/logo-mark.png" alt="" width={40} height={36} />
          Revizuno
        </a>
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

      <section className="plans plans-4">
        <article className="card stack plan">
          <h2>Gratuit</h2>
          <p className="price">
            {formatPrice(0, currency)} <small>pour toujours</small>
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
            <Link href="/commencer" className="btn btn-ghost">
              Créer mon compte
            </Link>
          )}
        </article>

        {PLANS.map((p) => {
          const m = planMath(p, currency);
          return (
            <article key={p.id} className={`card stack plan ${p.recommended ? "pro" : ""}`}>
              {p.recommended ? <span className="plan-badge">Offre recommandée</span> : null}
              <h2>{p.label}</h2>
              <p className="price">
                {m.price} <small>/ {p.period}</small>
              </p>
              <p className={p.recommended ? "" : "muted"}>
                {p.months > 1 ? (
                  <>
                    soit <strong>{m.perMonth} par mois</strong> · {m.saving} % d'économie
                  </>
                ) : (
                  "Sans engagement, résiliable à tout moment"
                )}
              </p>
              <ul className="plan-list">
                <li><Check />{pro.max_documents_per_month} cours importés par mois</li>
                <li><Check />{pro.max_generations_per_month} générations d'exercices par mois</li>
                <li><Check />Fichiers jusqu'à {pro.max_file_size_mb} Mo</li>
              </ul>
              {!user ? (
                <Link href="/commencer" className={p.recommended ? "btn btn-primary" : "btn btn-ghost"}>
                  Commencer
                </Link>
              ) : plan === "pro" ? (
                <BillingButton action="portal" label="Gérer mon abonnement" className="btn btn-ghost" />
              ) : (
                <BillingButton action="checkout" plan={p.id} currency={currency} label={`Choisir ${p.short}`} className={p.recommended ? "btn btn-primary" : "btn btn-ghost"} />
              )}
            </article>
          );
        })}
      </section>
      <p className="muted small" style={{ textAlign: "center" }}>
        Prix TTC en {currency === "chf" ? "francs suisses" : "euros"}. Paiement sécurisé par Stripe : carte, Apple Pay ou Google Pay. Renouvellement
        automatique à la fin de chaque période, résiliable à tout moment depuis ton tableau de bord.
      </p>
      <SiteFooter />
    </main>
  );
}
