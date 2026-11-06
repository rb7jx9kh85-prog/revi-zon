// Revizuno : paiement de l'abonnement Pro (Stripe).
// POST { action: "checkout" | "portal", plan?: "monthly" | "semester" | "annual", currency?: "eur" | "chf" }
// avec le jeton de l'utilisateur. Le prix Stripe est retrouvé par sa lookup key :
// revizuno_pro_<plan>_<devise> (un prix par offre et par devise).
// Répond { url } : page de paiement Stripe, ou portail pour gérer / résilier l'abonnement.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@19";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
// Ancien prix unique (mensuel), utilisé seulement si les lookup keys n'existent pas encore
const STRIPE_PRICE_ID = Deno.env.get("STRIPE_PRICE_ID") ?? "";
const PLANS = ["monthly", "semester", "annual"];
const CURRENCIES = ["eur", "chf"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function secretKey(): string {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys);
      if (parsed.default) return parsed.default;
    } catch {
      // clé au format inattendu : on retombe sur la clé historique
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});
// Créé à la demande : sans clé, la fonction doit quand même démarrer (CORS, message clair)
let stripeClient: Stripe | null = null;
const stripe = () => (stripeClient ??= new Stripe(STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() }));

// Adresse de l'app pour le retour depuis Stripe : APP_URL si défini, sinon l'origine du navigateur.
function appOrigin(req: Request): string | null {
  const configured = Deno.env.get("APP_URL");
  const candidate = configured || req.headers.get("origin") || "";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    return url.origin;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  if (!STRIPE_SECRET_KEY) return json({ error: "Le paiement n'est pas encore configuré." }, 503);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  const user = auth.user;
  if (!user) return json({ error: "Non connecté" }, 401);

  const origin = appOrigin(req);
  if (!origin) return json({ error: "Origine non autorisée" }, 400);

  let action = "checkout";
  let plan = "monthly";
  let currency = "eur";
  try {
    const body = await req.json();
    action = String(body.action ?? "checkout");
    if (PLANS.includes(body.plan)) plan = body.plan;
    if (CURRENCIES.includes(body.currency)) currency = body.currency;
  } catch {
    // corps vide : paiement mensuel par défaut
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, plan, subscription_status")
    .eq("id", user.id)
    .maybeSingle();

  let customerId = profile?.stripe_customer_id as string | null;

  try {
    if (action === "portal") {
      if (!customerId) return json({ error: "Aucun abonnement à gérer." }, 400);
      const portal = await stripe().billingPortal.sessions.create({ customer: customerId, return_url: `${origin}/dashboard` });
      return json({ url: portal.url });
    }

    // Déjà abonné : on renvoie vers le portail plutôt que de facturer deux fois
    if (customerId && profile?.plan === "pro" && ["active", "trialing", "past_due"].includes(String(profile?.subscription_status))) {
      const portal = await stripe().billingPortal.sessions.create({ customer: customerId, return_url: `${origin}/dashboard` });
      return json({ url: portal.url });
    }

    // Client Stripe inutilisable (créé en mode test, supprimé ou déjà facturé dans une autre devise) : on en recrée un
    if (customerId) {
      try {
        const existing = await stripe().customers.retrieve(customerId);
        if (existing.deleted || (existing.currency && existing.currency !== currency)) customerId = null;
      } catch {
        customerId = null;
      }
    }

    const prices = await stripe().prices.list({ lookup_keys: [`revizuno_pro_${plan}_${currency}`], active: true, limit: 1 });
    const priceId = prices.data[0]?.id ?? (plan === "monthly" ? STRIPE_PRICE_ID : "");
    if (!priceId) return json({ error: "Cette offre n'est pas encore disponible. Choisis-en une autre ou réessaie plus tard." }, 503);

    if (!customerId) {
      const customer = await stripe().customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      locale: "auto",
      subscription_data: { metadata: { supabase_user_id: user.id, plan } },
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?canceled=1`,
    });
    return json({ url: session.url });
  } catch (err) {
    console.error("billing", err instanceof Error ? err.message : err);
    return json({ error: "Le service de paiement n'a pas répondu. Réessaie dans un instant." }, 502);
  }
});
