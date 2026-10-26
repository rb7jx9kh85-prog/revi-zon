"use client";

import { useEffect } from "react";
import { burstConfetti } from "@/lib/confetti";

export function SessionProgress({ label, current, total, topic }: { label: string; current: number; total: number; topic?: string }) {
  const pct = total ? Math.round((Math.min(current, total) / total) * 100) : 0;
  return (
    <div className="session-head">
      <div className="session-row">
        <span className="session-label">
          {label} {Math.min(current + 1, total)} sur {total}
        </span>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
      {topic ? <span className="topic-pill">{topic}</span> : null}
    </div>
  );
}

export function SessionDone({
  title,
  detail,
  onRestart,
}: {
  title: string;
  detail: string;
  onRestart: () => void;
}) {
  useEffect(() => {
    burstConfetti();
  }, []);
  return (
    <div className="card stack done pop-in" style={{ textAlign: "center", justifyItems: "center" }}>
      <h2 style={{ fontSize: "1.8rem" }}>{title}</h2>
      <p className="muted">{detail}</p>
      <button type="button" className="btn btn-primary btn-inline" onClick={onRestart}>
        Recommencer
      </button>
    </div>
  );
}

export function EmptyExercises({ what }: { what: string }) {
  return (
    <div className="card stack" style={{ textAlign: "center" }}>
      <h2 style={{ fontSize: "1.4rem" }}>Pas encore de {what}</h2>
      <p className="muted">Ils apparaîtront ici dès que ton cours aura été préparé.</p>
    </div>
  );
}
