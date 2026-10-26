"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/env";
import type { ChatThread } from "@/lib/types";
import { Markdown } from "./markdown";

type Message = { id: string; role: "user" | "assistant"; content: string };
type Course = { id: string; title: string };

const STARTERS = [
  { title: "Explique-moi simplement", prompt: "Explique-moi simplement la notion la plus importante de mon dernier cours, avec un exemple concret." },
  { title: "Quiz express", prompt: "Pose-moi un quiz de 5 questions sur mes cours, une question à la fois, et corrige-moi au fur et à mesure." },
  { title: "Planning de révision", prompt: "Aide-moi à organiser mes révisions de la semaine avec mes cours actuels. J'ai environ 1 heure par jour." },
  { title: "Méthode de mémorisation", prompt: "Donne-moi une astuce pour mémoriser plus facilement les définitions de mes cours." },
];

let uid = 0;
const nextId = () => `m${Date.now()}-${uid++}`;

export function StudioChat({
  name,
  threads: initialThreads,
  courses,
  initialThreadId,
  initialCourseId,
}: {
  name: string;
  threads: ChatThread[];
  courses: Course[];
  initialThreadId: string | null;
  initialCourseId: string | null;
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [activeId, setActiveId] = useState<string | null>(initialThreadId);
  const [courseId, setCourseId] = useState<string>(initialCourseId ?? "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const active = threads.find((t) => t.id === activeId) ?? null;
  const focusCourse = courses.find((c) => c.id === (active ? active.document_id : courseId)) ?? null;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: streaming ? "auto" : "smooth" });
  }, [messages, streaming]);

  const openThread = useCallback(async (id: string | null) => {
    abortRef.current?.abort();
    setActiveId(id);
    setError(null);
    setSidebar(false);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("t", id);
    else url.searchParams.delete("t");
    url.searchParams.delete("doc");
    window.history.replaceState(null, "", url);
    if (!id) {
      setMessages([]);
      inputRef.current?.focus();
      return;
    }
    setLoadingThread(true);
    const supabase = createClient();
    const { data } = await supabase.from("chat_messages").select("id, role, content").eq("thread_id", id).order("id", { ascending: true });
    setMessages(((data ?? []) as { id: number; role: "user" | "assistant"; content: string }[]).map((m) => ({ ...m, id: String(m.id) })));
    setLoadingThread(false);
  }, []);

  useEffect(() => {
    if (initialThreadId) openThread(initialThreadId);
  }, [initialThreadId, openThread]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || streaming) return;
    setError(null);
    setDraft("");
    const botId = nextId();
    setMessages((m) => [...m, { id: nextId(), role: "user", content: message }, { id: botId, role: "assistant", content: "" }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/tutor`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ thread_id: activeId, document_id: activeId ? null : courseId || null, message }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Revi n'est pas disponible pour le moment. Réessaie dans un instant.");
      }

      const threadId = res.headers.get("X-Thread-Id");
      if (threadId && threadId !== activeId) {
        setActiveId(threadId);
        const title = message.replace(/\s+/g, " ").slice(0, 70) + (message.length > 70 ? "…" : "");
        setThreads((list) => [{ id: threadId, title, document_id: courseId || null, updated_at: new Date().toISOString() }, ...list]);
        const url = new URL(window.location.href);
        url.searchParams.set("t", threadId);
        url.searchParams.delete("doc");
        window.history.replaceState(null, "", url);
      } else if (threadId) {
        setThreads((list) => {
          const current = list.find((t) => t.id === threadId);
          return current ? [{ ...current, updated_at: new Date().toISOString() }, ...list.filter((t) => t.id !== threadId)] : list;
        });
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((list) => list.map((m) => (m.id === botId ? { ...m, content: m.content + chunk } : m)));
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Revi n'a pas pu répondre.");
        setMessages((list) => list.filter((m) => !(m.id === botId && !m.content)));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function removeThread(id: string) {
    if (!window.confirm("Supprimer cette conversation ?")) return;
    const supabase = createClient();
    const { error: delError } = await supabase.from("chat_threads").delete().eq("id", id);
    if (delError) {
      setError("Impossible de supprimer la conversation.");
      return;
    }
    setThreads((list) => list.filter((t) => t.id !== id));
    if (id === activeId) openThread(null);
  }

  async function copy(m: Message) {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(m.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // presse-papiers indisponible
    }
  }

  const empty = messages.length === 0 && !loadingThread;

  return (
    <div className={`studio ${sidebar ? "sidebar-open" : ""}`}>
      <aside className="studio-side" aria-label="Conversations">
        <div className="studio-side-head">
          <Link href="/dashboard" className="brand">
            <img src="/logo-mark.png" alt="" width={32} height={29} />
            Revizuno
          </Link>
          <button type="button" className="icon-btn studio-close" onClick={() => setSidebar(false)} aria-label="Fermer">
            ×
          </button>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openThread(null)}>
          + Nouvelle conversation
        </button>
        <p className="nav-title">Historique</p>
        <div className="thread-list">
          {threads.length === 0 ? <p className="muted small">Tes conversations apparaîtront ici.</p> : null}
          {threads.map((t) => (
            <div key={t.id} className={`thread ${t.id === activeId ? "on" : ""}`}>
              <button type="button" className="thread-open" onClick={() => openThread(t.id)}>
                <span className="clamp-1">{t.title}</span>
                <span className="muted small">{new Date(t.updated_at).toLocaleDateString("fr-CH", { day: "numeric", month: "short" })}</span>
              </button>
              <button type="button" className="thread-del" onClick={() => removeThread(t.id)} aria-label={`Supprimer « ${t.title} »`}>
                ×
              </button>
            </div>
          ))}
        </div>
        <Link href="/dashboard" className="link-btn small">
          ← Tableau de bord
        </Link>
      </aside>

      <section className="studio-main">
        <header className="studio-top">
          <button type="button" className="btn btn-ghost btn-inline studio-menu" onClick={() => setSidebar(true)}>
            ☰
          </button>
          <span className="revi-avatar" aria-hidden="true">
            R
          </span>
          <div className="studio-who">
            <strong>Studio Revi</strong>
            <span className="muted small">
              <span className="live-dot" /> {streaming ? "Revi écrit…" : "Ton tuteur IA, dispo 24h/24"}
            </span>
          </div>
          {focusCourse ? <span className="focus-pill">Cours : {focusCourse.title}</span> : null}
        </header>

        <div className="studio-list" ref={listRef}>
          {empty ? (
            <div className="studio-welcome fade-up">
              <span className="revi-avatar big" aria-hidden="true">
                R
              </span>
              <h1>
                Salut {name}, on <span className="mark">révise</span> quoi ?
              </h1>
              <p className="muted">Pose n'importe quelle question sur tes cours. Revi explique, te teste et t'aide à t'organiser.</p>
              {!activeId && courses.length > 0 && (
                <label className="focus-select">
                  Concentrer la discussion sur
                  <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                    <option value="">Tous mes cours</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="starter-grid stagger">
                {STARTERS.map((s) => (
                  <button key={s.title} type="button" className="starter" onClick={() => send(s.prompt)}>
                    <strong>{s.title}</strong>
                    <span className="muted small">{s.prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="studio-msgs">
              {loadingThread && (
                <div className="spinner" aria-hidden="true" style={{ justifySelf: "center" }}>
                  <span />
                  <span />
                  <span />
                </div>
              )}
              {messages.map((m) =>
                m.role === "user" ? (
                  <p key={m.id} className="bubble user pop-in">
                    {m.content}
                  </p>
                ) : (
                  <div key={m.id} className="bot-row pop-in">
                    <span className="revi-avatar" aria-hidden="true">
                      R
                    </span>
                    <div className="bubble bot">
                      {m.content ? (
                        <Markdown source={m.content} />
                      ) : (
                        <span className="typing-dots" aria-label="Revi écrit">
                          <i />
                          <i />
                          <i />
                        </span>
                      )}
                      {m.content && !(streaming && m.id === messages[messages.length - 1]?.id) ? (
                        <button type="button" className="copy-btn" onClick={() => copy(m)}>
                          {copied === m.id ? "Copié !" : "Copier"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ),
              )}
              {error && <p className="notice error">{error}</p>}
            </div>
          )}
        </div>

        <form
          className="studio-form"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <label htmlFor="studio-input" className="sr-only">
            Ton message
          </label>
          <textarea
            id="studio-input"
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={4000}
            placeholder="Écris à Revi… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)"
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(draft);
              }
            }}
          />
          {streaming ? (
            <button type="button" className="send-btn stop" onClick={() => abortRef.current?.abort()} aria-label="Arrêter">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button type="submit" className="send-btn" disabled={!draft.trim()} aria-label="Envoyer">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12 3.3 13.9z" />
              </svg>
            </button>
          )}
        </form>
      </section>
      <button type="button" className="studio-scrim" aria-label="Fermer le menu" onClick={() => setSidebar(false)} />
    </div>
  );
}
