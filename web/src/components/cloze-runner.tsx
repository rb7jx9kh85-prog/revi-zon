"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { isSameAnswer, splitCloze } from "@/lib/answers";
import type { ClozeContent, StudyItem } from "@/lib/types";
import { recordAttempt } from "./record-attempt";
import { EmptyExercises, SessionDone, SessionProgress } from "./session-progress";

export function ClozeRunner({ items }: { items: StudyItem<ClozeContent>[] }) {
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(false);
  const [score, setScore] = useState(0);
  const shownAt = useRef(Date.now());

  const item = items[index];
  const parts = useMemo(() => (item ? splitCloze(item.content.text) : []), [item]);

  if (items.length === 0) return <EmptyExercises what="textes à trous" />;

  if (index >= items.length) {
    return (
      <SessionDone
        title={`${score} / ${items.length}`}
        detail="Les phrases ratées reviendront en priorité à ta prochaine session."
        onRestart={() => {
          setIndex(0);
          setScore(0);
          setValues([]);
          setChecked(false);
          setHint(false);
        }}
      />
    );
  }

  const answers = item.content.answers;
  const results = answers.map((expected, i) => isSameAnswer(values[i] ?? "", expected));
  const allRight = results.every(Boolean);
  const someRight = results.some(Boolean);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (checked) {
      next();
      return;
    }
    setChecked(true);
    if (allRight) setScore((s) => s + 1);
    const quality = allRight ? (hint ? 4 : 5) : someRight ? 2 : 1;
    recordAttempt(item.id, quality, { values, hint }, Date.now() - shownAt.current);
  }

  function next() {
    setIndex((i) => i + 1);
    setValues([]);
    setChecked(false);
    setHint(false);
    shownAt.current = Date.now();
  }

  return (
    <form className="session" onSubmit={submit}>
      <SessionProgress label="Phrase" current={index} total={items.length} topic={item.content.topic} />

      <div className="card cloze-card">
        <p className="cloze-text">
          {parts.map((part, i) =>
            typeof part === "string" ? (
              <Fragment key={i}>{part}</Fragment>
            ) : (
              <span key={i} className={`blank ${checked ? (results[part] ? "right" : "wrong") : ""}`}>
                <input
                  aria-label={`Trou ${part + 1}`}
                  value={values[part] ?? ""}
                  onChange={(e) => {
                    const copy = [...values];
                    copy[part] = e.target.value;
                    setValues(copy);
                  }}
                  readOnly={checked}
                  autoFocus={part === 0}
                  autoComplete="off"
                  spellCheck={false}
                  size={Math.max(6, (answers[part] ?? "").length + 2)}
                  placeholder="…"
                />
                {checked && !results[part] ? <span className="blank-answer">{answers[part]}</span> : null}
              </span>
            ),
          )}
        </p>

        <div className="cloze-actions">
          {item.content.hint && !checked ? (
            hint ? (
              <span className="muted">Indice : {item.content.hint}</span>
            ) : (
              <button type="button" className="link-btn" onClick={() => setHint(true)}>
                Afficher un indice
              </button>
            )
          ) : (
            <span />
          )}
          <button type="submit" className="btn btn-primary btn-inline">
            {checked ? (index + 1 < items.length ? "Suivant" : "Voir mon score") : "Valider"}
          </button>
        </div>

        {checked ? <p className={allRight ? "verdict ok" : "verdict ko"}>{allRight ? "Parfait !" : "Presque : regarde la correction."}</p> : null}
      </div>
    </form>
  );
}
