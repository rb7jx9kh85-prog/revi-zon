// Revizuno : Studio Revi, le tuteur IA en plein écran.
// POST { thread_id?, document_id?, message }
// Répond en flux texte (la réponse s'affiche au fil de l'eau) ; l'en-tête
// X-Thread-Id donne la conversation (créée au premier message).
// Les messages sont enregistrés dans chat_threads / chat_messages.

import { createClient } from "npm:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODEL = Deno.env.get("OPENAI_CHAT_MODEL") ?? Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini";
const PRICE_IN = Number(Deno.env.get("OPENAI_PRICE_INPUT_PER_M") ?? "0.4");
const PRICE_OUT = Number(Deno.env.get("OPENAI_PRICE_OUTPUT_PER_M") ?? "1.6");
const MAX_MESSAGE_CHARS = 4000;
const HISTORY = 20;
const MAX_CONTEXT_CHARS = 50_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Thread-Id",
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

const SYSTEM_PROMPT = `Tu es Revi, le tuteur IA de Revizuno, l'app qui aide les élèves et les étudiants à réviser leurs cours.

Ta personnalité
- Chaleureux, motivant et patient, comme un grand frère ou une grande sœur brillant(e) qui adore expliquer.
- Tu tutoies, tu restes simple et direct, avec une pointe d'humour quand ça aide. Au maximum un emoji par réponse.
- Tu réponds dans la langue de l'étudiant (français par défaut).

Ta méthode
1. Comprends d'abord la vraie question. Si elle est floue, pose UNE question de clarification courte.
2. Explique pas à pas : idée principale d'abord, puis détails. Utilise des exemples concrets, des analogies du quotidien et des mini-schémas en texte quand c'est utile.
3. Exercices et devoirs : guide avec un indice ou une question (méthode socratique) avant de donner la solution. Si l'étudiant bloque encore ou demande explicitement la solution, donne-la entièrement et explique-la.
4. Vérifie la compréhension : termine souvent par une petite question de contrôle ou un mini-défi (« À toi : … »).
5. Quand c'est pertinent, propose un outil de Revizuno : flashcards, quiz, textes à trous, « Explique avec tes mots », fiche ou résumé du cours, export PDF, ou planifier une session de révision dans le calendrier du tableau de bord.

Tes sources
- Appuie-toi d'abord sur les cours de l'étudiant fournis ci-dessous. Cite le cours concerné quand tu t'en sers.
- Si tu sors du cours, dis-le (« Ça va au-delà de ton cours, mais… »).
- Si tu n'es pas sûr, dis-le honnêtement. N'invente jamais de faits, de chiffres ou de sources.

Ta mise en forme
- Markdown simple : paragraphes courts, listes à puces, **gras** pour les mots-clés, titres ### seulement pour les longues réponses. Pas de tableau.
- Maths et sciences en texte lisible, sans LaTeX : x², √2, a/b, H₂O, →.
- Réponses courtes par défaut (moins de 200 mots) ; plus longues seulement si la question le demande.

Tes limites
- Tu restes centré sur les études, l'organisation des révisions et la motivation.
- Si un étudiant semble aller mal (stress intense, détresse), réponds avec bienveillance et encourage-le à en parler à un proche, à l'infirmerie scolaire ou à un service d'aide comme le 147 (Suisse).`;

type Doc = { id: string; title: string; summary: string | null; extracted_text: string | null; status: string };

async function buildContext(userId: string, documentId: string | null) {
  const { data: profile } = await admin.from("profiles").select("display_name, school_level").eq("id", userId).maybeSingle();
  const parts: string[] = [];
  if (profile?.display_name) parts.push(`Prénom de l'étudiant : ${profile.display_name}`);
  if (profile?.school_level) parts.push(`Niveau d'études : ${profile.school_level} (adapte ton niveau d'explication)`);

  if (documentId) {
    const { data: doc } = await admin
      .from("documents")
      .select("id, title, summary, extracted_text, status")
      .eq("id", documentId)
      .eq("user_id", userId)
      .maybeSingle<Doc>();
    if (doc) {
      const { data: sheet } = await admin
        .from("revision_sheets")
        .select("content_md")
        .eq("document_id", doc.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      parts.push(`La conversation porte sur le cours « ${doc.title} ».`);
      if (doc.summary) parts.push(`Résumé : ${doc.summary}`);
      if (sheet?.content_md) parts.push(`Fiche de révision :\n${sheet.content_md}`);
      if (doc.extracted_text) parts.push(`Texte du cours :\n${doc.extracted_text}`);
    }
  } else {
    const { data: docs } = await admin
      .from("documents")
      .select("title, summary")
      .eq("user_id", userId)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(15);
    if (docs?.length) {
      parts.push(
        "Les cours de l'étudiant :\n" +
          docs.map((d: { title: string; summary: string | null }) => `- ${d.title}${d.summary ? ` : ${d.summary}` : ""}`).join("\n"),
      );
    } else {
      parts.push("L'étudiant n'a pas encore importé de cours.");
    }
  }
  return parts.join("\n\n").slice(0, MAX_CONTEXT_CHARS);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  if (!OPENAI_API_KEY) {
    console.error("tutor: OPENAI_API_KEY manquante");
    return json({ error: "Revi n'est pas encore disponible. Réessaie plus tard." }, 503);
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  const user = auth.user;
  if (!user) return json({ error: "Non connecté" }, 401);

  let message = "";
  let threadId = "";
  let documentId: string | null = null;
  try {
    const body = await req.json();
    message = String(body.message ?? "").trim().slice(0, MAX_MESSAGE_CHARS);
    threadId = String(body.thread_id ?? "");
    documentId = body.document_id ? String(body.document_id) : null;
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  if (!message) return json({ error: "Aucune question" }, 400);

  // Conversation existante ou nouvelle
  if (threadId) {
    const { data: thread } = await admin
      .from("chat_threads")
      .select("id, document_id")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!thread) return json({ error: "Conversation introuvable" }, 404);
    documentId = thread.document_id;
  } else {
    if (documentId) {
      const { data: doc } = await admin.from("documents").select("id").eq("id", documentId).eq("user_id", user.id).maybeSingle();
      if (!doc) documentId = null;
    }
    const title = message.replace(/\s+/g, " ").slice(0, 70) + (message.length > 70 ? "…" : "");
    const { data: created, error } = await admin
      .from("chat_threads")
      .insert({ user_id: user.id, document_id: documentId, title })
      .select("id")
      .single();
    if (error || !created) {
      console.error("tutor: création de conversation", error?.message);
      return json({ error: "Impossible de démarrer la conversation." }, 500);
    }
    threadId = created.id;
  }

  await admin.from("chat_messages").insert({ thread_id: threadId, user_id: user.id, role: "user", content: message });

  const { data: rows } = await admin
    .from("chat_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("id", { ascending: false })
    .limit(HISTORY);
  const history = ((rows ?? []) as { role: "user" | "assistant"; content: string }[]).reverse();

  const context = await buildContext(user.id, documentId);
  const openai = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      instructions: `${SYSTEM_PROMPT}\n\n--- Contexte de l'étudiant ---\n${context}`,
      input: history.map((m) => ({ role: m.role, content: m.content })),
      max_output_tokens: 1500,
      stream: true,
    }),
  });

  if (!openai.ok || !openai.body) {
    console.error("tutor openai", openai.status, (await openai.text()).slice(0, 500));
    return json({ error: "Revi n'est pas disponible pour le moment. Réessaie dans un instant." }, 502);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const userId = user.id;
  const finalThreadId = threadId;

  const stream = new ReadableStream({
    async start(controller) {
      const reader = openai.body!.getReader();
      let buffer = "";
      let answer = "";
      let usage: { input_tokens?: number; output_tokens?: number } | null = null;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            let event: { type?: string; delta?: string; response?: { usage?: typeof usage } };
            try {
              event = JSON.parse(payload);
            } catch {
              continue;
            }
            if (event.type === "response.output_text.delta" && event.delta) {
              answer += event.delta;
              controller.enqueue(encoder.encode(event.delta));
            } else if (event.type === "response.completed") {
              usage = event.response?.usage ?? null;
            }
          }
        }
      } catch (err) {
        console.error("tutor stream", err instanceof Error ? err.message : err);
      }

      if (!answer.trim()) {
        answer = "Je n'ai pas pu formuler de réponse. Peux-tu reformuler ta question ?";
        controller.enqueue(encoder.encode(answer));
      }
      // Enregistrement avant de fermer le flux : le worker peut s'arrêter juste après
      await admin.from("chat_messages").insert({ thread_id: finalThreadId, user_id: userId, role: "assistant", content: answer.slice(0, 20000) });
      await admin.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", finalThreadId);
      const inTok = usage?.input_tokens ?? 0;
      const outTok = usage?.output_tokens ?? 0;
      await admin.rpc("record_ai_usage", { p_user: userId, p_tokens: inTok + outTok, p_cost: (inTok * PRICE_IN + outTok * PRICE_OUT) / 1_000_000 });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-Thread-Id": finalThreadId },
  });
});
