// Offres Revizuno Pro. Chaque offre existe en EUR et en CHF dans Stripe,
// retrouvée par sa « lookup key » : revizuno_pro_<offre>_<devise>.
// Les montants affichés ici doivent correspondre aux prix créés dans Stripe.

export type Currency = "eur" | "chf";
export type PlanId = "monthly" | "semester" | "annual";

export type Plan = {
  id: PlanId;
  label: string;
  short: string;
  months: number;
  period: string;
  amount: Record<Currency, number>;
  recommended?: boolean;
};

export const PLANS: Plan[] = [
  { id: "monthly", label: "Pro mensuel", short: "1 mois", months: 1, period: "mois", amount: { eur: 9.99, chf: 9.99 } },
  { id: "semester", label: "Pro semestre", short: "6 mois", months: 6, period: "6 mois", amount: { eur: 34.99, chf: 34.99 }, recommended: true },
  { id: "annual", label: "Pro annuel", short: "1 an", months: 12, period: "an", amount: { eur: 59.99, chf: 59.99 } },
];

export const DEFAULT_PLAN: PlanId = "semester";

export function isPlanId(value: unknown): value is PlanId {
  return PLANS.some((p) => p.id === value);
}

export function formatPrice(amount: number, currency: Currency) {
  return currency === "chf"
    ? new Intl.NumberFormat("fr-CH", { style: "currency", currency: "CHF" }).format(amount)
    : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);
}

// Prix ramené au mois et économie réelle par rapport à l'offre mensuelle
export function planMath(plan: Plan, currency: Currency) {
  const monthly = PLANS[0].amount[currency];
  const perMonth = plan.amount[currency] / plan.months;
  return {
    price: formatPrice(plan.amount[currency], currency),
    perMonth: formatPrice(Math.floor(perMonth * 100) / 100, currency),
    perDay: formatPrice(Math.floor((plan.amount[currency] / (plan.months * 30)) * 100) / 100, currency),
    saving: plan.months > 1 ? Math.round((1 - perMonth / monthly) * 100) : 0,
  };
}
