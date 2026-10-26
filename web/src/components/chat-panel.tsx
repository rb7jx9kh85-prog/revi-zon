"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Markdown } from "./markdown";

type Message = { role: "user" | "assistant"; content: string };

async function readError(error: unknown): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.json();
      if (body?.error) return String(body.error);
    } catch {
      // réponse non JSON
    }
  }
  return "Revi n'a pas pu répondre. Réessaie dans un instant.";
}

export function ChatPanel({
  documentId,
  ready,
  suggestions,
  onClose,
}: {
  documentId: string;
  ready: boolean;
  suggestions: string[];
  onClose?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || sending || !ready) return;
    const history: Message[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    setDraft("");
    setError(null);
    setSending(true);

    const supabase = createClient();
    const { data, error: fnError } = await supabase.functions.invoke("chat", {
      body: { document_id: documentId, messages: history },
    });
    setSending(false);
    if (fnError || !data?.answer) {
      setError(fnError ? await readError(fnError) : "Revi n'a pas pu répondre. Réessaie dans un instant.");
      return;
    }
    setMessages([...history, { role: "assistant", content: String(data.answer) }]);
  }

  return (
    <aside className="chat" aria-label="Demander à Revi">
      <div className="chat-head">
        <span className="chat-title">
          <span className="chat-dot" aria-hidden="true" />
          Demande à Revi
        </span>
        {onClose ? (
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer le chat">
            ×
          </button>
        ) : null}
      </div>

      <div className="chat-list" ref={listRef}>
        {messages.length === 0 ? (
          <div className="chat-empty stack">
            <h3>Pose-moi tes questions</h3>
            <p className="muted">Revi a lu tout ce cours : tes questions dessus ont les meilleures réponses.</p>
            {ready &&
              suggestions.map((s) => (
                <button key={s} type="button" className="suggestion" onClick={() => ask(s)}>
                  {s}
                </button>
              ))}
            {!ready && <p className="notice">Revi sera disponible dès que ton cours sera prêt.</p>}
          </div>
        ) : (
          messages.map((m, i) =>
            m.role === "user" ? (
              <p key={i} className="bubble user">
                {m.content}
              </p>
            ) : (
              <div key={i} className="bubble bot">
                <Markdown source={m.content} />
              </div>
            ),
          )
        )}
        {sending && <p className="bubble bot typing">Revi réfléchit…</p>}
        {error && <p className="notice error">{error}</p>}
      </div>

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Ta question
        </label>
        <textarea
          id="chat-input"
          rows={2}
          value={draft}
          maxLength={2000}
          placeholder={ready ? "Pose une question sur ton cours…" : "Cours en préparation…"}
          disabled={!ready}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(draft);
            }
          }}
        />
        <button type="submit" className="send-btn" disabled={!ready || sending || !draft.trim()} aria-label="Envoyer">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12 3.3 13.9z" />
          </svg>
        </button>
      </form>
    </aside>
  );
}
