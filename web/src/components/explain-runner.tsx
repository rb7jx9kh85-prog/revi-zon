"use client";

import { useState } from "react";
import { burstConfetti } from "@/lib/confetti";
import { readFunctionError } from "@/lib/fn-error";
import { createClient } from "@/lib/supabase/client";
import type { ExplainFeedback, FlashcardContent, StudyItem } from "@/lib/types";
import { recordAttempt } from "./record-attempt";
import { EmptyExercises, SessionDone, SessionProgress } from "./session-progress";

// Note SM-2 (0 à 5) à partir de la note de Revi (0 à 100)
function quality(score: number) {
  if (score >= 85) return 5;
  if (score >= 65) return 4;
  if (score >= 45) return 3;
  if (score >= 25) return 2;
  return 1;
}

function ScoreRing({ score }: { score: number }) {
  const tone = score >= 70 ? "var(--accent-4)" : score >= 40 ? "var(--accent)" : "var(--accent-2)";
  return (
    <div className="score-ring" style={{ "--score": score, "--tone": tone } as React.CSSProperties} role="img" aria-label={`Note : ${score} sur 100`}>
      <span>{score}</span>
    </div>
  );
}

function FeedbackList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div className="fb-col" style={{ borderColor: tone }}>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function ExplainRunner({ documentId, cards }: { documentId: string; cards: StudyItem<FlashcardContent>[] }) {
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ExplainFeedback | null>(null);
  const [scores, setScores] = useState<number[]>([]);

  if (cards.length === 0) return <EmptyExercises what="notions à expliquer" />;

  const card = cards[index];
  if (!card) {
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return (
      <SessionDone
        title="Bravo, session terminée !"
        detail={scores.length ? `Moyenne de tes explications : ${avg}/100. Expliquer, c'est la meilleure façon de retenir.` : "Reviens quand tu veux t'entraîner à expliquer."}
        onRestart={() => {
          setIndex(0);
          setScores([]);
          setFeedback(null);
          setDraft("");
        }}
      />
    );
  }

  async function submit(text: string) {
    if (loading) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: fnError } = await supabase.functions.invoke("study-tools", {
      body: { action: "explain", document_id: documentId, exercise_id: card.id, explanation: text },
    });
    setLoading(false);
    if (fnError || !data?.feedback) {
      setError(fnError ? await readFunctionError(fnError, "Revi n'a pas pu corriger. Réessaie.") : "Revi n'a pas pu corriger. Réessaie.");
      return;
    }
    const fb = data.feedback as ExplainFeedback;
    setFeedback(fb);
    setScores((s) => [...s, fb.score]);
    recordAttempt(card.id, quality(fb.score), { explain: text.slice(0, 500), score: fb.score });
    if (fb.score >= 85) burstConfetti();
  }

  function next() {
    setFeedback(null);
    setDraft("");
    setError(null);
    setIndex((i) => i + 1);
  }

  return (
    <div className="session">
      <SessionProgress label="Notion" current={index} total={cards.length} topic={card.content.topic} />

      <section className="card stack explain-card pop-in" key={card.id}>
        <span className="kicker">Explique avec tes mots</span>
        <h2 className="explain-q">{card.content.front}</h2>
        <p className="muted small">Imagine que tu l'expliques à un ami qui n'a pas suivi le cours. Pas besoin de phrases parfaites.</p>

        {!feedback ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim().length >= 3) submit(draft);
            }}
          >
            <label htmlFor="explain-input" className="sr-only">
              Ton explication
            </label>
            <textarea
              id="explain-input"
              rows={5}
              maxLength={3000}
              value={draft}
              disabled={loading}
              placeholder="Pour moi, c'est…"
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="cloze-actions">
              <button type="button" className="link-btn" disabled={loading} onClick={() => submit("Je ne sais pas, peux-tu m'expliquer ?")}>
                Je ne sais pas, montre-moi
              </button>
              <div className="row-center">
                <button type="button" className="btn btn-ghost btn-inline" onClick={next} disabled={loading}>
                  Passer
                </button>
                <button type="submit" className="btn btn-primary btn-inline" disabled={loading || draft.trim().length < 3}>
                  {loading ? "Revi corrige…" : "Envoyer à Revi"}
                </button>
              </div>
            </div>
            {loading && (
              <div className="spinner" aria-hidden="true" style={{ justifySelf: "center" }}>
                <span />
                <span />
                <span />
              </div>
            )}
            {error && <p className="notice error">{error}</p>}
          </form>
        ) : (
          <div className="stack fade-up">
            <div className="fb-head">
              <ScoreRing score={feedback.score} />
              <p className="fb-verdict">{feedback.verdict}</p>
            </div>
            <div className="fb-grid">
              <FeedbackList title="Ce qui est juste" items={feedback.strengths} tone="var(--accent-4)" />
              <FeedbackList title="Ce qui manque" items={feedback.missing} tone="var(--accent)" />
              <FeedbackList title="À corriger" items={feedback.misconceptions} tone="var(--accent-2)" />
            </div>
            <div className="fb-model">
              <h3>L'explication de Revi</h3>
              <p>{feedback.model_answer}</p>
            </div>
            {feedback.tip ? (
              <p className="fb-tip">
                <strong>Astuce mémo :</strong> {feedback.tip}
              </p>
            ) : null}
            <div className="row-center">
              <button
                type="button"
                className="btn btn-ghost btn-inline"
                onClick={() => {
                  setFeedback(null);
                  setScores((s) => s.slice(0, -1));
                }}
              >
                Réessayer
              </button>
              <button type="button" className="btn btn-primary btn-inline" onClick={next}>
                Notion suivante →
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
