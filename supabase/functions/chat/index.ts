// Revi-zon : « Demande à Revi », tuteur qui répond à partir du cours de l'étudiant.
// POST { document_id, messages: [{ role: "user" | "assistant", content }] }
// Répond { answer }.

import { createClient } from "npm:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODEL = Deno.env.get("OPENAI_CHAT_MODEL") ?? Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini";
const PRICE_IN = Number(Deno.env.get("OPENAI_PRICE_INPUT_PER_M") ?? "0.4");
const PRICE_OUT = Number(Deno.env.get("OPENAI_PRICE_OUTPUT_PER_M") ?? "1.6");
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 4000;
const MAX_CONTEXT_CHARS = 60_000;

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

type Message = { role: "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  if (!OPENAI_API_KEY) {
    console.error("chat: OPENAI_API_KEY manquante");
    return json({ error: "Revi n'est pas encore disponible. Réessaie plus tard." }, 503);
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  const user = auth.user;
  if (!user) return json({ error: "Non connecté" }, 401);

  let documentId = "";
  let messages: Message[] = [];
  try {
    const body = await req.json();
    documentId = String(body.document_id ?? "");
    messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m: Message) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-MAX_MESSAGES)
      .map((m: Message) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return json({ error: "Aucune question" }, 400);
  }

  const { data: doc } = await admin
    .from("documents")
    .select("id, title, status, source, openai_file_id, extracted_text, summary")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!doc) return json({ error: "Document introuvable" }, 404);
  if (doc.status !== "ready") return json({ error: "Le cours est encore en préparation." }, 409);

  const { data: sheet } = await admin
    .from("revision_sheets")
    .select("content_md")
    .eq("document_id", doc.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const contextParts = [
    `Cours : « ${doc.title} »`,
    doc.summary ? `Résumé : ${doc.summary}` : "",
    sheet?.content_md ? `Fiche de révision :\n${sheet.content_md}` : "",
    doc.extracted_text ? `Texte du cours :\n${doc.extracted_text}` : "",
  ].filter(Boolean);
  const context = contextParts.join("\n\n").slice(0, MAX_CONTEXT_CHARS);

  const firstUserContent: unknown[] = [{ type: "input_text", text: context }];
  if (doc.source === "pdf" && doc.openai_file_id) {
    firstUserContent.push({ type: "input_file", file_id: doc.openai_file_id });
  }

  const input = [
    { role: "user", content: firstUserContent },
    { role: "assistant", content: "J'ai lu ton cours. Pose-moi ta question." },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      instructions:
        "Tu es Revi, le tuteur de l'application Revi-zon. Tu aides un étudiant à comprendre son cours. " +
        "Réponds dans la langue de l'étudiant, de façon claire, courte et pédagogique (exemples concrets, étapes). " +
        "Appuie-toi d'abord sur le cours fourni ; si la question en sort, dis-le puis réponds brièvement. " +
        "Si l'étudiant demande la réponse d'un exercice, guide-le avec un indice avant de donner la solution. " +
        "Utilise du Markdown simple (listes, **gras**), pas de tableau.",
      input,
      max_output_tokens: 900,
    }),
  });

  if (!res.ok) {
    console.error("chat", res.status, (await res.text()).slice(0, 500));
    return json({ error: "Le tuteur n'est pas disponible pour le moment. Réessaie dans un instant." }, 502);
  }

  const body = await res.json();
  const answer = (body.output ?? [])
    .flatMap((item: { type: string; content?: { type: string; text?: string }[] }) =>
      item.type === "message" ? item.content ?? [] : []
    )
    .filter((c: { type: string }) => c.type === "output_text")
    .map((c: { text?: string }) => c.text ?? "")
    .join("")
    .trim();

  const inTok = body.usage?.input_tokens ?? 0;
  const outTok = body.usage?.output_tokens ?? 0;
  await admin.rpc("record_ai_usage", {
    p_user: user.id,
    p_tokens: inTok + outTok,
    p_cost: (inTok * PRICE_IN + outTok * PRICE_OUT) / 1_000_000,
  });

  return json({ answer: answer || "Je n'ai pas pu formuler de réponse. Peux-tu reformuler ta question ?" });
});
