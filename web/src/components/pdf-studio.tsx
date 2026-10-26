"use client";

import { useEffect, useState } from "react";
import { burstConfetti } from "@/lib/confetti";
import { readFunctionError } from "@/lib/fn-error";
import type { PdfData, PdfSection } from "@/lib/pdf/study-pdf";
import { PDF_THEMES, type PdfThemeId } from "@/lib/pdf/themes";
import { createClient } from "@/lib/supabase/client";

const SECTIONS: { id: PdfSection; label: string; detail: (d: PdfData) => string }[] = [
  { id: "summary", label: "Résumé", detail: (d) => (d.summaryMd ? "L'essentiel + check-list" : "Revi le rédige au moment de l'export") },
  { id: "sheet", label: "Fiche de révision", detail: (d) => (d.sheetMd ? "Le cours structuré" : "Indisponible") },
  { id: "flashcards", label: "Flashcards", detail: (d) => `${d.flashcards.length} cartes question / réponse` },
  { id: "quiz", label: "Quiz + corrigé", detail: (d) => `${d.quiz.length} questions` },
  { id: "cloze", label: "Textes à trous + corrigé", detail: (d) => `${d.cloze.length} phrases` },
];

function available(id: PdfSection, d: PdfData) {
  if (id === "summary") return true;
  if (id === "sheet") return Boolean(d.sheetMd);
  if (id === "flashcards") return d.flashcards.length > 0;
  if (id === "quiz") return d.quiz.length > 0;
  return d.cloze.length > 0;
}

function fileName(title: string) {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${slug || "cours"}-revi-zon.pdf`;
}

export function PdfStudio({ documentId, data: initial }: { documentId: string; data: PdfData }) {
  const [data, setData] = useState(initial);
  const [theme, setTheme] = useState<PdfThemeId>("pop");
  const [sections, setSections] = useState<PdfSection[]>(() => SECTIONS.filter((s) => available(s.id, initial)).map((s) => s.id));
  const [status, setStatus] = useState<"idle" | "summary" | "render">("idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function toggle(id: PdfSection) {
    setSections((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  async function generate() {
    setError(null);
    let current = data;
    try {
      if (sections.includes("summary") && !current.summaryMd) {
        setStatus("summary");
        const supabase = createClient();
        const { data: res, error: fnError } = await supabase.functions.invoke("study-tools", {
          body: { action: "summary", document_id: documentId },
        });
        if (fnError || !res?.summary_md) throw new Error(fnError ? await readFunctionError(fnError, "Le résumé n'a pas pu être rédigé.") : "Le résumé n'a pas pu être rédigé.");
        current = { ...current, summaryMd: String(res.summary_md) };
        setData(current);
      }
      setStatus("render");
      const { renderStudyPdf } = await import("@/lib/pdf/study-pdf");
      const ordered = SECTIONS.map((s) => s.id).filter((id) => sections.includes(id));
      const blob = await renderStudyPdf(current, theme, ordered);
      const url = URL.createObjectURL(blob);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName(current.title);
      document.body.appendChild(a);
      a.click();
      a.remove();
      burstConfetti(60);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error && err.message ? err.message : "Le PDF n'a pas pu être créé. Réessaie.");
    } finally {
      setStatus("idle");
    }
  }

  const busy = status !== "idle";

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div className="stack" style={{ gap: 6 }}>
        <span className="kicker">Export PDF</span>
        <h1 className="sheet-title">Ton cours en PDF</h1>
        <p className="muted">Choisis un style et ce que tu veux dedans : Revi te prépare un joli PDF à télécharger, imprimer ou envoyer.</p>
      </div>

      <section className="stack">
        <h2 style={{ fontSize: "1.2rem" }}>1. Le style</h2>
        <div className="theme-grid stagger">
          {PDF_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-card ${theme === t.id ? "on" : ""}`}
              onClick={() => setTheme(t.id)}
              aria-pressed={theme === t.id}
            >
              <span className="theme-preview" style={{ background: t.page, color: t.ink, borderColor: t.border }}>
                <span className="tp-title" style={{ background: t.accents[0], color: t.onAccent }}>
                  Aa
                </span>
                <span className="tp-line" style={{ background: t.accents[1] }} />
                <span className="tp-line short" style={{ background: t.accents[2] }} />
                <span className="tp-cards">
                  <i style={{ background: t.accents[3], borderColor: t.border }} />
                  <i style={{ background: t.accents[0], borderColor: t.border }} />
                </span>
              </span>
              <strong>{t.label}</strong>
              <span className="muted small">{t.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="stack">
        <h2 style={{ fontSize: "1.2rem" }}>2. Le contenu</h2>
        <div className="check-grid">
          {SECTIONS.map((s) => {
            const ok = available(s.id, data);
            return (
              <label key={s.id} className={`check-card ${sections.includes(s.id) ? "on" : ""} ${ok ? "" : "off"}`}>
                <input type="checkbox" checked={sections.includes(s.id)} disabled={!ok} onChange={() => toggle(s.id)} />
                <span>
                  <strong>{s.label}</strong>
                  <span className="muted small">{s.detail(data)}</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <div className="row-center">
        <button type="button" className="btn btn-primary btn-inline btn-lg" onClick={generate} disabled={busy || sections.length === 0}>
          {status === "summary" ? "Revi rédige le résumé…" : status === "render" ? "Mise en page…" : "Générer et télécharger le PDF"}
        </button>
      </div>
      {error && <p className="notice error">{error}</p>}

      {preview && (
        <section className="stack fade-up">
          <div className="topbar">
            <h2 style={{ fontSize: "1.2rem" }}>Aperçu</h2>
            <a className="btn btn-ghost btn-inline" href={preview} download={fileName(data.title)}>
              Télécharger à nouveau
            </a>
          </div>
          <iframe className="pdf-preview" src={preview} title="Aperçu du PDF" />
        </section>
      )}
    </div>
  );
}
