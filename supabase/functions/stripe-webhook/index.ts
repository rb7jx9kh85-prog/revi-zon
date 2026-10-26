// Revi-zon : reçoit les événements Stripe et met à jour le plan de l'étudiant.
// À déclarer dans Stripe > Developers > Webhooks avec les événements :
// checkout.session.completed, customer.subscription.created,
// customer.subscription.updated, customer.subscription.deleted

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { httpClient: Stripe.createFetchHttpClient() });
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

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

const PRO_STATUSES = ["active", "trialing", "past_due"];

async function syncSubscription(sub: Stripe.Subscription, fallbackUserId?: string | null) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  let userId = sub.metadata?.supabase_user_id || fallbackUserId || null;
  if (!userId) {
    const { data } = await admin.from("profiles").select("id").eq("stripe_customer_id", customerId).maybeSingle();
    userId = data?.id ?? null;
  }
  if (!userId) {
    console.warn("stripe-webhook: aucun profil pour", customerId);
    return;
  }

  // Selon la version de l'API Stripe, la fin de période est sur l'abonnement ou sur ses lignes
  const raw = sub as unknown as { current_period_end?: number; items?: { data?: { current_period_end?: number }[] } };
  const periodEnd = raw.items?.data?.[0]?.current_period_end ?? raw.current_period_end ?? null;

  const { error } = await admin
    .from("profiles")
    .update({
      plan: PRO_STATUSES.includes(sub.status) ? "pro" : "free",
      stripe_customer_id: customerId,
      subscription_status: sub.status,
      subscription_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      subscription_cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    })
    .eq("id", userId);
  if (error) throw new Error(`Mise à jour du profil : ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Méthode non autorisée", { status: 405 });
  if (!WEBHOOK_SECRET) return new Response("STRIPE_WEBHOOK_SECRET manquant", { status: 500 });

  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature ?? "", WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch (err) {
    return new Response(`Signature invalide : ${err instanceof Error ? err.message : err}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscription(sub, session.client_reference_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("stripe-webhook", event.type, err instanceof Error ? err.message : err);
    // 500 : Stripe renverra l'événement plus tard
    return new Response("Erreur de traitement", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
