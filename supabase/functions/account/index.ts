// Revizuno : suppression du compte par l'étudiant.
// POST { action: "delete" } avec le jeton de l'utilisateur.
// Résilie l'abonnement Stripe, supprime les fichiers (stockage et copies chez OpenAI)
// puis le compte ; toutes les données liées disparaissent en cascade.
// L'adresse e-mail peut ensuite être réutilisée pour un nouveau compte.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@19";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

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

const ACTIVE = ["active", "trialing", "past_due", "unpaid", "incomplete"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  const user = auth.user;
  if (!user) return json({ error: "Non connecté" }, 401);

  let action = "";
  try {
    action = String((await req.json()).action ?? "");
  } catch {
    // corps vide
  }
  if (action !== "delete") return json({ error: "Action inconnue" }, 400);

  const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle();

  // 1. Abonnement : résilié tout de suite, sinon l'étudiant continuerait à payer
  const customerId = profile?.stripe_customer_id as string | null;
  if (customerId) {
    if (!STRIPE_SECRET_KEY) return json({ error: "Impossible de résilier ton abonnement pour le moment. Réessaie plus tard." }, 503);
    try {
      const stripe = new Stripe(STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
      const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
      for (const sub of subs.data) {
        if (ACTIVE.includes(sub.status)) await stripe.subscriptions.cancel(sub.id);
      }
    } catch (err) {
      console.error("account: résiliation Stripe", err instanceof Error ? err.message : err);
      return json({ error: "Impossible de résilier ton abonnement pour le moment. Réessaie dans un instant." }, 502);
    }
  }

  // 2. Fichiers des cours : stockage Supabase et copies chez OpenAI
  const { data: docs } = await admin.from("documents").select("storage_path, openai_file_id").eq("user_id", user.id);
  const paths = (docs ?? []).map((d: { storage_path: string | null }) => d.storage_path).filter((p): p is string => Boolean(p));
  if (paths.length) {
    const { error } = await admin.storage.from("documents").remove(paths);
    if (error) console.error("account: suppression des fichiers", error.message);
  }
  if (OPENAI_API_KEY) {
    for (const d of (docs ?? []) as { openai_file_id: string | null }[]) {
      if (!d.openai_file_id) continue;
      const res = await fetch(`https://api.openai.com/v1/files/${d.openai_file_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      });
      if (!res.ok && res.status !== 404) console.error("account: fichier OpenAI", d.openai_file_id, res.status);
    }
  }

  // 3. Compte : profil, cours, exercices, progression, conversations… supprimés en cascade
  const { error: delError } = await admin.auth.admin.deleteUser(user.id);
  if (delError) {
    console.error("account: suppression du compte", delError.message);
    return json({ error: "La suppression a échoué. Réessaie ou écris-nous." }, 500);
  }

  return json({ deleted: true });
});
