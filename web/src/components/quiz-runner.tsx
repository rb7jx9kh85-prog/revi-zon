"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuizContent, StudyItem } from "@/lib/types";
import { recordAttempt } from "./record-attempt";
import { EmptyExercises, SessionDone, SessionProgress } from "./session-progress";

export function QuizRunner({ questions }: { questions: StudyItem<QuizContent>[] }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const shownAt = useRef(Date.now());

  const q = questions[index];
  const done = index >= questions.length;

  const pick = useCallback(
    (choice: number) => {
      if (!q || picked !== null || choice >= q.content.options.length) return;
      const correct = choice === q.content.correct_index;
      setPicked(choice);
      if (correct) setScore((s) => s + 1);
      recordAttempt(q.id, correct ? 5 : 1, { choice }, Date.now() - shownAt.current);
    },
    [picked, q],
  );

  const next = useCallback(() => {
    setPicked(null);
    setIndex((i) => i + 1);
    shownAt.current = Date.now();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (done || (e.target as HTMLElement)?.closest("input, textarea")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 6) pick(n - 1);
      else if (e.key === "Enter" && picked !== null) next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, next, pick, picked]);

  if (questions.length === 0) return <EmptyExercises what="questions de quiz" />;

  if (done) {
    return (
      <SessionDone
        title={`${score} / ${questions.length}`}
        detail={score === questions.length ? "Sans faute, bravo !" : "Les questions ratées reviendront en priorité à ta prochaine session."}
        onRestart={() => {
          setIndex(0);
          setScore(0);
          setPicked(null);
        }}
      />
    );
  }

  const answered = picked !== null;

  return (
    <div className="session">
      <SessionProgress label="Question" current={index} total={questions.length} topic={q.content.topic} />
      <h2 className="question">{q.content.question}</h2>

      <div className="options">
        {q.content.options.map((option, i) => {
          const state = !answered ? "" : i === q.content.correct_index ? "right" : i === picked ? "wrong" : "dim";
          return (
            <button key={i} type="button" className={`option ${state}`} onClick={() => pick(i)} disabled={answered}>
              <span className="option-key">{i + 1}</span>
              <span>{option}</span>
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="feedback stack">
          <p className={picked === q.content.correct_index ? "verdict ok" : "verdict ko"}>
            {picked === q.content.correct_index ? "Bonne réponse !" : `La bonne réponse était : ${q.content.options[q.content.correct_index]}`}
          </p>
          {q.content.explanation ? <p className="muted">{q.content.explanation}</p> : null}
          <button type="button" className="btn btn-primary btn-inline" onClick={next} autoFocus>
            {index + 1 < questions.length ? "Question suivante" : "Voir mon score"}
          </button>
        </div>
      )}
    </div>
  );
}
