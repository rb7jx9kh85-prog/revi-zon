// Revizuno : transforme un cours importé en set de révision.
// Un seul appel OpenAI (sortie JSON structurée) produit la fiche, les flashcards,
// les textes à trous, le quiz et les questions suggérées pour le chat.
//
// POST { document_id } avec le jeton de l'utilisateur (Authorization: Bearer).
// Répond 202 tout de suite ; le traitement continue en arrière-plan et met à jour
// documents.status (processing -> ready | failed).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini";
// Prix en dollars par million de tokens, pour estimer le coût
const PRICE_IN = Number(Deno.env.get("OPENAI_PRICE_INPUT_PER_M") ?? "0.4");
const PRICE_OUT = Number(Deno.env.get("OPENAI_PRICE_OUTPUT_PER_M") ?? "1.6");
const STALE_MINUTES = 6;
const MAX_TEXT_CHARS = 180_000;

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

type Doc = {
  id: string;
  user_id: string;
  title: string;
  source: "pdf" | "image" | "docx" | "pptx" | "text";
  storage_path: string | null;
  mime_type: string | null;
  status: string;
  openai_file_id: string | null;
};

// ---------------------------------------------------------------------------
// Schéma de sortie demandé au modèle
// ---------------------------------------------------------------------------

const str = { type: "string" };
const int = { type: "integer" };
const STUDY_SET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "sheet_title", "sheet_markdown", "suggested_questions", "flashcards", "cloze", "quiz"],
  properties: {
    summary: str,
    sheet_title: str,
    sheet_markdown: str,
    suggested_questions: { type: "array", items: str },
    flashcards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["front", "back", "topic", "difficulty"],
        properties: { front: str, back: str, topic: str, difficulty: int },
      },
    },
    cloze: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "answers", "hint", "topic", "difficulty"],
        properties: { text: str, answers: { type: "array", items: str }, hint: str, topic: str, difficulty: int },
      },
    },
    quiz: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "options", "correct_index", "explanation", "topic", "difficulty"],
        properties: {
          question: str,
          options: { type: "array", items: str },
          correct_index: int,
          explanation: str,
          topic: str,
          difficulty: int,
        },
      },
    },
  },
};

type StudySet = {
  summary: string;
  sheet_title: string;
  sheet_markdown: string;
  suggested_questions: string[];
  flashcards: { front: string; back: string; topic: string; difficulty: number }[];
  cloze: { text: string; answers: string[]; hint: string; topic: string; difficulty: number }[];
  quiz: { question: string; options: string[]; correct_index: number; explanation: string; topic: string; difficulty: number }[];
};

function instructions(level: string | null) {
  return `Tu es un professeur expert qui prépare un set de révision à partir du cours fourni par un étudiant.
Niveau de l'étudiant : ${level || "non précisé, vise un niveau lycée / début d'université"}.

Règles :
- Base-toi uniquement sur le contenu du cours. N'invente pas de faits.
- Écris dans la langue du cours (français par défaut).
- Couvre toutes les notions importantes, du plus simple au plus exigeant.
- "difficulty" va de 1 (facile) à 5 (difficile). "topic" est la notion travaillée en 1 à 4 mots.
- summary : 2 à 3 phrases qui résument le cours.
- sheet_title : titre court de la fiche.
- sheet_markdown : fiche de révision complète en Markdown (titres "##" et "###", listes "-", **gras** pour les mots clés, définitions, formules, exemples). Pas de tableau ni d'image.
- suggested_questions : 3 questions courtes qu'un étudiant poserait à un tuteur sur ce cours.
- flashcards : 12 à 20 cartes. "front" = une question ou un terme, "back" = réponse courte et précise.
- cloze : 8 à 12 phrases à trous tirées des idées clés. Marque chaque trou par {{1}}, {{2}}… dans l'ordre ; "answers" donne la réponse de chaque trou dans le même ordre (1 à 3 mots chacune). "hint" aide sans donner la réponse.
- quiz : 10 questions à choix multiple, 4 options chacune, une seule bonne réponse ("correct_index" commence à 0). Varie la position de la bonne réponse. "explanation" explique pourquoi c'est la bonne réponse.`;
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

async function uploadToOpenAI(file: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("purpose", "user_data");
  form.append("file", file, filename);
  const res = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI files ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return body.id as string;
}

type Usage = { input_tokens?: number; output_tokens?: number };

async function generate(content: unknown[], level: string | null): Promise<{ data: StudySet; usage: Usage }> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      instructions: instructions(level),
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: "study_set", strict: true, schema: STUDY_SET_SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const body = await res.json();
  const text = (body.output ?? [])
    .flatMap((item: { type: string; content?: { type: string; text?: string }[] }) =>
      item.type === "message" ? item.content ?? [] : []
    )
    .filter((c: { type: string }) => c.type === "output_text")
    .map((c: { text?: string }) => c.text ?? "")
    .join("");
  if (!text) throw new Error("Réponse vide du modèle");
  return { data: JSON.parse(text) as StudySet, usage: body.usage ?? {} };
}

// ---------------------------------------------------------------------------
// Validation (même règles que la contrainte SQL is_valid_exercise_content)
// ---------------------------------------------------------------------------

const clampDifficulty = (d: number) => Math.min(5, Math.max(1, Math.round(Number(d) || 2)));
const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "");

function exerciseRows(set: StudySet, doc: Doc, generationId: string) {
  const base = { user_id: doc.user_id, document_id: doc.id, generation_id: generationId };
  const rows: Record<string, unknown>[] = [];

  for (const f of set.flashcards ?? []) {
    const front = clean(f.front), back = clean(f.back);
    if (front && back) rows.push({ ...base, kind: "flashcard", difficulty: clampDifficulty(f.difficulty), content: { front, back, topic: clean(f.topic) } });
  }
  for (const c of set.cloze ?? []) {
    const text = clean(c.text);
    const answers = (c.answers ?? []).map(clean).filter(Boolean);
    const blanks = [...new Set(text.match(/\{\{\d+\}\}/g) ?? [])];
    if (text.includes("{{1}}") && answers.length > 0 && blanks.length === answers.length) {
      rows.push({ ...base, kind: "cloze", difficulty: clampDifficulty(c.difficulty), content: { text, answers, hint: clean(c.hint), topic: clean(c.topic) } });
    }
  }
  for (const q of set.quiz ?? []) {
    const question = clean(q.question);
    const options = (q.options ?? []).map(clean).filter(Boolean);
    const idx = Number(q.correct_index);
    if (question && options.length >= 2 && options.length <= 6 && Number.isInteger(idx) && idx >= 0 && idx < options.length) {
      rows.push({
        ...base,
        kind: "quiz",
        difficulty: clampDifficulty(q.difficulty),
        content: { question, options, correct_index: idx, explanation: clean(q.explanation), topic: clean(q.topic) },
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Traitement
// ---------------------------------------------------------------------------

async function buildInput(doc: Doc): Promise<unknown[]> {
  const intro = { type: "input_text", text: `Titre donné par l'étudiant : « ${doc.title} ». Voici le cours.` };

  if (doc.source === "docx" || doc.source === "pptx") {
    throw new Error("Ce format n'est pas encore pris en charge. Exporte ton fichier en PDF et importe-le à nouveau.");
  }
  if (!doc.storage_path) throw new Error("Aucun fichier associé à ce document.");

  if (doc.source === "pdf") {
    let fileId = doc.openai_file_id;
    if (!fileId) {
      const { data, error } = await admin.storage.from("documents").download(doc.storage_path);
      if (error || !data) throw new Error("Fichier introuvable dans le stockage.");
      fileId = await uploadToOpenAI(data, doc.storage_path.split("/").pop() || "cours.pdf");
      await admin.from("documents").update({ openai_file_id: fileId }).eq("id", doc.id);
    }
    return [intro, { type: "input_file", file_id: fileId }];
  }

  const { data, error } = await admin.storage.from("documents").download(doc.storage_path);
  if (error || !data) throw new Error("Fichier introuvable dans le stockage.");

  if (doc.source === "image") {
    const b64 = encodeBase64(new Uint8Array(await data.arrayBuffer()));
    const mime = doc.mime_type || data.type || "image/jpeg";
    return [intro, { type: "input_image", image_url: `data:${mime};base64,${b64}`, detail: "high" }];
  }

  const text = (await data.text()).slice(0, MAX_TEXT_CHARS);
  if (!text.trim()) throw new Error("Le texte importé est vide.");
  await admin.from("documents").update({ extracted_text: text }).eq("id", doc.id);
  return [intro, { type: "input_text", text }];
}

async function processDocument(doc: Doc) {
  const { data: generation } = await admin
    .from("generations")
    .insert({ user_id: doc.user_id, document_id: doc.id, kind: "study_set", status: "running", model: MODEL })
    .select("id")
    .single();
  const generationId = generation?.id as string;

  try {
    const { data: profile } = await admin.from("profiles").select("school_level").eq("id", doc.user_id).maybeSingle();
    const input = await buildInput(doc);
    const { data: set, usage } = await generate(input, profile?.school_level ?? null);

    const rows = exerciseRows(set, doc, generationId);
    if (rows.length === 0) throw new Error("Aucun exercice exploitable n'a pu être généré à partir de ce cours.");

    // En cas de relance, on remplace le contenu précédent
    await admin.from("exercises").delete().eq("document_id", doc.id);
    await admin.from("revision_sheets").delete().eq("document_id", doc.id);

    const { error: exErr } = await admin.from("exercises").insert(rows);
    if (exErr) throw new Error(`Enregistrement des exercices : ${exErr.message}`);

    if (clean(set.sheet_markdown)) {
      const { error: shErr } = await admin.from("revision_sheets").insert({
        user_id: doc.user_id,
        document_id: doc.id,
        generation_id: generationId,
        title: (clean(set.sheet_title) || doc.title).slice(0, 200),
        content_md: set.sheet_markdown,
      });
      if (shErr) throw new Error(`Enregistrement de la fiche : ${shErr.message}`);
    }

    const inTok = usage.input_tokens ?? 0;
    const outTok = usage.output_tokens ?? 0;
    const cost = (inTok * PRICE_IN + outTok * PRICE_OUT) / 1_000_000;

    await admin
      .from("generations")
      .update({
        status: "succeeded",
        prompt_tokens: inTok,
        completion_tokens: outTok,
        cost_usd: Number(cost.toFixed(6)),
        params: { flashcards: set.flashcards?.length ?? 0, cloze: set.cloze?.length ?? 0, quiz: set.quiz?.length ?? 0, saved: rows.length },
        completed_at: new Date().toISOString(),
      })
      .eq("id", generationId);
    await admin.rpc("record_ai_usage", { p_user: doc.user_id, p_tokens: inTok + outTok, p_cost: cost });

    await admin
      .from("documents")
      .update({
        status: "ready",
        error_message: null,
        summary: clean(set.summary) || null,
        suggested_questions: (set.suggested_questions ?? []).map(clean).filter(Boolean).slice(0, 3),
      })
      .eq("id", doc.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("process-document", doc.id, message);
    const userMessage = message.startsWith("OpenAI") ? "Le service d'IA n'a pas répondu correctement. Réessaie dans un instant." : message;
    await admin.from("documents").update({ status: "failed", error_message: userMessage.slice(0, 500) }).eq("id", doc.id);
    if (generationId) {
      await admin
        .from("generations")
        .update({ status: "failed", error_message: message.slice(0, 1000), completed_at: new Date().toISOString() })
        .eq("id", generationId);
    }
  }
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

async function authenticate(req: Request, client: SupabaseClient) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const user = await authenticate(req, admin);
  if (!user) return json({ error: "Non connecté" }, 401);

  let documentId = "";
  try {
    documentId = String((await req.json()).document_id ?? "");
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }

  const { data: doc } = await admin
    .from("documents")
    .select("id, user_id, title, source, storage_path, mime_type, status, openai_file_id")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .maybeSingle<Doc>();
  if (!doc) return json({ error: "Document introuvable" }, 404);
  if (doc.status === "ready") return json({ status: "ready" });

  if (!OPENAI_API_KEY) {
    const message = "Le service d'IA n'est pas encore configuré. Réessaie plus tard.";
    console.error("process-document: OPENAI_API_KEY manquante");
    await admin.from("documents").update({ status: "failed", error_message: message }).eq("id", doc.id);
    return json({ error: message }, 503);
  }

  // Réserve le document (évite deux traitements en parallèle)
  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  const { data: claimed } = await admin
    .from("documents")
    .update({ status: "processing", error_message: null })
    .eq("id", doc.id)
    .or(`status.eq.uploaded,status.eq.failed,and(status.eq.processing,updated_at.lt.${staleBefore})`)
    .select("id");
  if (!claimed || claimed.length === 0) return json({ status: "processing" }, 202);

  const { data: allowed, error: quotaErr } = await admin.rpc("consume_generation_quota", { p_user: user.id });
  if (quotaErr || !allowed) {
    await admin
      .from("documents")
      .update({ status: "failed", error_message: "Quota mensuel de générations atteint." })
      .eq("id", doc.id);
    return json({ error: "Quota mensuel de générations atteint." }, 402);
  }

  // @ts-ignore EdgeRuntime est fourni par Supabase
  EdgeRuntime.waitUntil(processDocument(doc));
  return json({ status: "processing" }, 202);
});
