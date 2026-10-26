"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DocumentStatus } from "@/lib/types";

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
  return "Le traitement n'a pas pu démarrer. Réessaie dans un instant.";
}

const STEPS = ["Lecture du cours", "Repérage des notions clés", "Création des flashcards et du quiz", "Rédaction de la fiche"];

// Lance (si besoin) puis suit la préparation d'un cours.
export function ProcessingStatus({ documentId, status, error }: { documentId: string; status: DocumentStatus; error: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const started = useRef(false);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (status !== "uploaded" || started.current) return;
    started.current = true;
    createClient()
      .functions.invoke("process-document", { body: { document_id: documentId } })
      .then(async ({ error: fnError }) => {
        if (fnError) setStartError(await readError(fnError));
        router.refresh();
      });
  }, [attempt, documentId, router, status]);

  useEffect(() => {
    if (status !== "processing" && status !== "uploaded") return;
    const poll = setInterval(() => router.refresh(), 3000);
    const steps = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 9000);
    return () => {
      clearInterval(poll);
      clearInterval(steps);
    };
  }, [router, status]);

  async function retry() {
    setRetrying(true);
    setStartError(null);
    const supabase = createClient();
    const { error: updError } = await supabase.from("documents").update({ status: "uploaded" }).eq("id", documentId);
    if (updError) {
      setStartError("Impossible de relancer pour le moment.");
      setRetrying(false);
      return;
    }
    started.current = false;
    router.refresh();
    setRetrying(false);
  }

  if (status === "failed") {
    return (
      <div className="card stack">
        <h2 style={{ fontSize: "1.4rem" }}>La préparation a échoué</h2>
        <p className="notice error">{error || "Une erreur inattendue est survenue."}</p>
        <button type="button" className="btn btn-primary btn-inline" onClick={retry} disabled={retrying}>
          {retrying ? "Relance…" : "Réessayer"}
        </button>
        {startError && <p className="notice error">{startError}</p>}
      </div>
    );
  }

  return (
    <div className="card stack processing">
      <div className="spinner" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h2 style={{ fontSize: "1.5rem" }}>Revi prépare ton cours…</h2>
      <ol className="steps-list">
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? "done" : i === step ? "current" : ""}>
            {label}
          </li>
        ))}
      </ol>
      <p className="muted">Ça prend en général moins d'une minute. Tu peux rester sur cette page.</p>
      {startError && (
        <>
          <p className="notice error">{startError}</p>
          <button
            type="button"
            className="btn btn-primary btn-inline"
            onClick={() => {
              setStartError(null);
              started.current = false;
              setAttempt((n) => n + 1);
            }}
          >
            Réessayer
          </button>
        </>
      )}
    </div>
  );
}
