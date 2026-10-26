"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readFunctionError } from "@/lib/fn-error";
import { createClient } from "@/lib/supabase/client";
import { Markdown } from "./markdown";

export function SummaryView({ documentId, title, initial }: { documentId: string; title: string; initial: string | null }) {
  const [summary, setSummary] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const generate = useCallback(
    async (refresh: boolean) => {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      const { data, error: fnError } = await supabase.functions.invoke("study-tools", {
        body: { action: "summary", document_id: documentId, refresh },
      });
      setLoading(false);
      if (fnError || !data?.summary_md) {
        setError(fnError ? await readFunctionError(fnError, "Revi n'a pas pu rédiger le résumé.") : "Revi n'a pas pu rédiger le résumé.");
        return;
      }
      setSummary(String(data.summary_md));
    },
    [documentId],
  );

  useEffect(() => {
    if (!initial && !started.current) {
      started.current = true;
      generate(false);
    }
  }, [generate, initial]);

  return (
    <article className="sheet summary">
      <div className="topbar">
        <div className="stack" style={{ gap: 6 }}>
          <span className="kicker">Résumé du cours</span>
          <h1 className="sheet-title">{title}</h1>
        </div>
        {summary && (
          <button type="button" className="btn btn-ghost btn-inline" onClick={() => generate(true)} disabled={loading}>
            {loading ? "Revi réécrit…" : "Régénérer"}
          </button>
        )}
      </div>

      {loading && !summary ? (
        <div className="card stack processing">
          <div className="spinner" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h2 style={{ fontSize: "1.3rem" }}>Revi résume ton cours…</h2>
          <p className="muted">L'essentiel, les notions clés, les pièges et ta check-list d'examen. Quelques secondes.</p>
        </div>
      ) : null}

      {error && (
        <div className="stack">
          <p className="notice error">{error}</p>
          <button type="button" className="btn btn-primary btn-inline" onClick={() => generate(Boolean(summary))}>
            Réessayer
          </button>
        </div>
      )}

      {summary ? (
        <div className={`fade-up ${loading ? "is-loading" : ""}`}>
          <Markdown source={summary} className="summary-md" />
        </div>
      ) : null}
    </article>
  );
}
