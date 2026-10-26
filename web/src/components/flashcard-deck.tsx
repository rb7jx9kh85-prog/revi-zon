"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FlashcardContent, StudyItem } from "@/lib/types";
import { recordAttempt } from "./record-attempt";
import { EmptyExercises, SessionDone, SessionProgress } from "./session-progress";

export function FlashcardDeck({ cards }: { cards: StudyItem<FlashcardContent>[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const shownAt = useRef(Date.now());

  const card = cards[index];
  const done = index >= cards.length;

  const answer = useCallback(
    (knewIt: boolean) => {
      if (!card) return;
      recordAttempt(card.id, knewIt ? 5 : 2, { knew: knewIt }, Date.now() - shownAt.current);
      if (knewIt) setKnown((k) => k + 1);
      setFlipped(false);
      setIndex((i) => i + 1);
      shownAt.current = Date.now();
    },
    [card],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (done || (e.target as HTMLElement)?.closest("input, textarea")) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && (e.key === "ArrowRight" || e.key === "2")) answer(true);
      else if (flipped && (e.key === "ArrowLeft" || e.key === "1")) answer(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, done, flipped]);

  if (cards.length === 0) return <EmptyExercises what="flashcards" />;

  if (done) {
    return (
      <SessionDone
        title="Paquet terminé"
        detail={`Tu connaissais ${known} carte${known > 1 ? "s" : ""} sur ${cards.length}. Celles à revoir reviendront plus tôt.`}
        onRestart={() => {
          setIndex(0);
          setKnown(0);
          setFlipped(false);
        }}
      />
    );
  }

  return (
    <div className="session">
      <SessionProgress label="Carte" current={index} total={cards.length} topic={card.content.topic} />

      <div className="fc-stage">
        <button
          type="button"
          className={`fc ${flipped ? "flipped" : ""}`}
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? "Voir la question" : "Voir la réponse"}
        >
          <span className="fc-face">
            <span className="fc-kicker">Question</span>
            <span className="fc-text">{card.content.front}</span>
            <span className="fc-hint">Touche la carte ou appuie sur Espace</span>
          </span>
          <span className="fc-face back">
            <span className="fc-kicker">Réponse</span>
            <span className="fc-text">{card.content.back}</span>
          </span>
        </button>
      </div>

      <div className="row-center">
        <button type="button" className="btn btn-again btn-inline" onClick={() => answer(false)} disabled={!flipped}>
          À revoir
        </button>
        <button type="button" className="btn btn-good btn-inline" onClick={() => answer(true)} disabled={!flipped}>
          Je savais
        </button>
      </div>
    </div>
  );
}
