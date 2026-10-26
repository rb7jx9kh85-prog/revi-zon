"use client";

import Link from "next/link";
import { useState } from "react";
import { ChatPanel } from "./chat-panel";
import { StudyNav } from "./study-nav";

export function StudyShell({
  documentId,
  title,
  ready,
  suggestions,
  counts,
  children,
}: {
  documentId: string;
  title: string;
  ready: boolean;
  suggestions: string[];
  counts: Record<string, number | null>;
  children: React.ReactNode;
}) {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className={`study ${chatOpen ? "chat-open" : ""}`}>
      <header className="study-top">
        <Link href="/dashboard" className="back" aria-label="Retour à mes cours">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <Link href="/dashboard" className="brand small">
          <img src="/logo-mark.png" alt="" width={32} height={29} />
        </Link>
        <h1 className="study-title">{title}</h1>
        <button type="button" className="btn btn-ghost btn-inline chat-toggle" onClick={() => setChatOpen((o) => !o)}>
          Demander à Revi
        </button>
      </header>

      <StudyNav documentId={documentId} counts={counts} />
      <main className="study-main">{children}</main>
      <ChatPanel documentId={documentId} ready={ready} suggestions={suggestions} onClose={() => setChatOpen(false)} />
    </div>
  );
}
