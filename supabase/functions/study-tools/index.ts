// Revi-zon : outils de révision à la demande.
// POST { action: "explain", document_id, exercise_id, explanation }
//   L'étudiant explique une notion avec ses mots ; Revi corrige et note.
//   Répond { feedback: { score, verdict, strengths, missing, misconceptions, model_answer, tip } }.
// POST { action: "summary", document_id, refresh? }
//   Résumé détaillé du cours (Markdown), mis en cache dans documents.summary_md.
//   Répond { summary_md }.

import { createClient } from "npm:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODEL = Deno.env.get("OPENAI_CHAT_MODEL") ?? Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini";
const PRICE_IN = Number(Deno.env.get("OPENAI_PRICE_INPUT_PER_M") ?? "0.4");
const PRICE_OUT = Number(Deno.env.get("OPENAI_PRICE_OUTPUT_PER_M") ?? "1.6");
const MAX_CONTEXT_CHARS = 40_000;
const MAX_EXPLANATION_CHARS = 3000;

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

type Doc = { id: string; title: string; summary: string | null; summary_md: string | null; extracted_text: string | null; status: string };

const FEEDBACK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "verdict", "strengths", "missing", "misconceptions", "model_answer", "tip"],
  properties: {
    score: { type: "integer", description: "Note de 0 à 100 de la justesse et de la complétude de l'explication" },
    verdict: { type: "string", description: "Une phrase d'accroche encourageante qui résume le niveau" },
    strengths: { type: "array", items: { type: "string" }, description: "Ce qui est juste (0 à 3 points)" },
    missing: { type: "array", items: { type: "string" }, description: "Éléments importants absents (0 à 3 points)" },
    misconceptions: { type: "array", items: { type: "string" }, description: "Erreurs ou confusions, corrigées (0 à 3 points)" },
    model_answer: { type: "string", description: "Une explication modèle courte (3 à 5 phrases), simple et juste" },
    tip: { type: "string", description: "Une astuce mémo ou une analogie pour retenir" },
  },
};

async function callOpenAI(body: Record<string, unknown>, userId: string) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  if (!res.ok) {
    console.error("study-tools openai", res.status, (await res.text()).slice(0, 500));
    return null;
  }
  const data = await res.json();
  const text = (data.output ?? [])
    .flatMap((item: { type: string; content?: { type: string; text?: string }[] }) => (item.type === "message" ? item.content ?? [] : []))
    .filter((c: { type: string }) => c.type === "output_text")
    .map((c: { text?: string }) => c.text ?? "")
    .join("")
    .trim();
  const inTok = data.usage?.input_tokens ?? 0;
  const outTok = data.usage?.output_tokens ?? 0;
  await admin.rpc("record_ai_usage", { p_user: userId, p_tokens: inTok + outTok, p_cost: (inTok * PRICE_IN + outTok * PRICE_OUT) / 1_000_000 });
  return text;
}

async function courseContext(doc: Doc) {
  const { data: sheet } = await admin
    .from("revision_sheets")
    .select("content_md")
    .eq("document_id", doc.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return [
    `Cours : « ${doc.title} »`,
    doc.summary ? `Résumé : ${doc.summary}` : "",
    sheet?.content_md ? `Fiche de révision :\n${sheet.content_md}` : "",
    doc.extracted_text ? `Texte du cours :\n${doc.extracted_text}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_CONTEXT_CHARS);
}

function levelLine(level: string | null) {
  return level ? `Niveau de l'étudiant : ${level}. Adapte ton vocabulaire et ton exigence à ce niveau.` : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  if (!OPENAI_API_KEY) {
    console.error("study-tools: OPENAI_API_KEY manquante");
    return json({ error: "Revi n'est pas encore disponible. Réessaie plus tard." }, 503);
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  const user = auth.user;
  if (!user) return json({ error: "Non connecté" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }

  const { data: doc } = await admin
    .from("documents")
    .select("id, title, summary, summary_md, extracted_text, status")
    .eq("id", String(body.document_id ?? ""))
    .eq("user_id", user.id)
    .maybeSingle();
  if (!doc) return json({ error: "Document introuvable" }, 404);
  if (doc.status !== "ready") return json({ error: "Le cours est encore en préparation." }, 409);

  const { data: profile } = await admin.from("profiles").select("school_level").eq("id", user.id).maybeSingle();
  const level = (profile?.school_level as string | null) ?? null;

  if (body.action === "explain") {
    const explanation = String(body.explanation ?? "").trim().slice(0, MAX_EXPLANATION_CHARS);
    if (explanation.length < 3) return json({ error: "Écris ton explication avant de l'envoyer." }, 400);

    const { data: exercise } = await admin
      .from("exercises")
      .select("id, kind, content")
      .eq("id", String(body.exercise_id ?? ""))
      .eq("document_id", doc.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!exercise || exercise.kind !== "flashcard") return json({ error: "Notion introuvable" }, 404);
    const card = exercise.content as { front: string; back: string };

    const text = await callOpenAI(
      {
        instructions:
          "Tu es Revi, le tuteur bienveillant de Revi-zon. Un étudiant explique une notion de son cours avec ses propres mots " +
          "(technique Feynman). Évalue la justesse et la complétude de son explication par rapport au cours, pas son style ni son orthographe. " +
          "Sois honnête mais encourageant, tutoie l'étudiant, réponds en français et reste concret. " +
          "Note : 90-100 explication juste et complète, 70-89 juste avec des oublis mineurs, 40-69 partielle, 1-39 confuse ou fausse, 0 hors sujet. " +
          levelLine(level),
        input: [
          { role: "user", content: [{ type: "input_text", text: await courseContext(doc) }] },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Notion à expliquer : ${card.front}\nRéponse attendue (référence) : ${card.back}\n\nExplication de l'étudiant :\n${explanation}`,
              },
            ],
          },
        ],
        text: { format: { type: "json_schema", name: "explain_feedback", strict: true, schema: FEEDBACK_SCHEMA } },
        max_output_tokens: 900,
      },
      user.id,
    );
    if (!text) return json({ error: "Revi n'a pas pu corriger pour le moment. Réessaie dans un instant." }, 502);
    try {
      const feedback = JSON.parse(text);
      feedback.score = Math.max(0, Math.min(100, Math.round(Number(feedback.score) || 0)));
      return json({ feedback });
    } catch {
      return json({ error: "Revi n'a pas pu corriger pour le moment. Réessaie dans un instant." }, 502);
    }
  }

  if (body.action === "summary") {
    if (doc.summary_md && !body.refresh) return json({ summary_md: doc.summary_md });

    const summary = await callOpenAI(
      {
        instructions:
          "Tu es Revi, le tuteur de Revi-zon. Rédige le résumé de révision du cours fourni, en français, en Markdown simple " +
          "(titres ##, listes à puces, **gras** pour les mots-clés, pas de tableau, pas d'emoji). Structure exacte :\n" +
          "## L'essentiel en un coup d'œil\n5 à 7 puces courtes, une idée par puce.\n" +
          "## Les notions clés\nUne puce par notion : **Terme** : définition en une phrase.\n" +
          "## Comment tout s'enchaîne\nUn court paragraphe qui relie les notions entre elles (causes, étapes, logique).\n" +
          "## Les pièges classiques\n3 à 5 puces : confusions fréquentes et comment les éviter.\n" +
          "## Check-list avant l'examen\n4 à 6 puces commençant par « Je sais… ».\n" +
          "Reste fidèle au cours, n'invente rien. " +
          levelLine(level),
        input: [{ role: "user", content: [{ type: "input_text", text: await courseContext(doc) }] }],
        max_output_tokens: 1800,
      },
      user.id,
    );
    if (!summary) return json({ error: "Revi n'a pas pu rédiger le résumé. Réessaie dans un instant." }, 502);
    await admin.from("documents").update({ summary_md: summary }).eq("id", doc.id);
    return json({ summary_md: summary });
  }

  return json({ error: "Action inconnue" }, 400);
});
