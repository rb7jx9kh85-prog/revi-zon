"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { downloadIcs, googleCalendarUrl } from "@/lib/calendar";
import { burstConfetti } from "@/lib/confetti";
import { createClient } from "@/lib/supabase/client";
import type { StudySession } from "@/lib/types";

type Course = { id: string; title: string };
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const DURATIONS = [15, 25, 30, 45, 60, 90];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function heat(count: number) {
  if (!count) return 0;
  if (count < 5) return 1;
  if (count < 15) return 2;
  if (count < 30) return 3;
  return 4;
}

export function PlannerBoard({ activity, sessions: initial, courses }: { activity: Record<string, number>; sessions: StudySession[]; courses: Course[] }) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [sessions, setSessions] = useState(initial);
  const [date, setDate] = useState(dayKey(today));
  const [time, setTime] = useState("18:00");
  const [duration, setDuration] = useState(30);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, StudySession[]>();
    for (const s of sessions) {
      const k = dayKey(new Date(s.starts_at));
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return map;
  }, [sessions]);

  const cells = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7; // lundi en premier
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [month]);

  // Dates et heures dépendent du fuseau du navigateur : rendu côté client uniquement
  if (!mounted) {
    return (
      <section className="card stack planner" aria-busy="true">
        <h2 style={{ fontSize: "1.3rem" }}>Mon calendrier</h2>
        <div className="cal-skeleton" />
      </section>
    );
  }

  const upcoming = sessions
    .filter((s) => new Date(s.starts_at).getTime() + s.duration_min * 60_000 >= Date.now())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  function event(s: StudySession) {
    const course = courses.find((c) => c.id === s.document_id);
    const origin = window.location.origin;
    return {
      uid: s.id,
      title: s.title,
      start: new Date(s.starts_at),
      durationMin: s.duration_min,
      details: course ? `Session de révision Revizuno : ${course.title}` : "Session de révision Revizuno",
      url: course ? `${origin}/study/${course.id}` : `${origin}/dashboard`,
    };
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const start = new Date(`${date}T${time}`);
    if (Number.isNaN(start.getTime())) {
      setError("Date ou heure invalide.");
      return;
    }
    setSaving(true);
    const course = courses.find((c) => c.id === courseId);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("study_sessions")
      .insert({ document_id: course?.id ?? null, title: course ? `Révision : ${course.title}`.slice(0, 120) : "Session de révision", starts_at: start.toISOString(), duration_min: duration })
      .select("id, document_id, title, starts_at, duration_min, done")
      .single();
    setSaving(false);
    if (insertError || !data) {
      setError("Impossible d'enregistrer la session. Réessaie.");
      return;
    }
    setSessions((list) => [...list, data as StudySession]);
    setJustAdded((data as StudySession).id);
    setOpen(false);
    burstConfetti(40);
  }

  async function toggleDone(s: StudySession) {
    const supabase = createClient();
    setSessions((list) => list.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)));
    const { error: updError } = await supabase.from("study_sessions").update({ done: !s.done }).eq("id", s.id);
    if (updError) setSessions((list) => list.map((x) => (x.id === s.id ? s : x)));
    else if (!s.done) burstConfetti(50);
  }

  async function remove(s: StudySession) {
    const supabase = createClient();
    const { error: delError } = await supabase.from("study_sessions").delete().eq("id", s.id);
    if (!delError) setSessions((list) => list.filter((x) => x.id !== s.id));
  }

  const monthLabel = month.toLocaleDateString("fr-CH", { month: "long", year: "numeric" });
  const todayKey = dayKey(today);

  return (
    <section className="card stack planner">
      <div className="topbar">
        <h2 style={{ fontSize: "1.3rem" }}>Mon calendrier</h2>
        <div className="row-center" style={{ gap: 6 }}>
          <button type="button" className="cal-nav" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Mois précédent">
            ‹
          </button>
          <span className="cal-month">{monthLabel}</span>
          <button type="button" className="cal-nav" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Mois suivant">
            ›
          </button>
        </div>
      </div>

      <div className="cal" role="grid" aria-label={`Activité de ${monthLabel}`}>
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="cal-wd" aria-hidden="true">
            {d}
          </span>
        ))}
        {cells.map((d) => {
          const k = dayKey(d);
          const count = activity[k] ?? 0;
          const daySessions = sessionsByDay.get(k) ?? [];
          const outside = d.getMonth() !== month.getMonth();
          return (
            <button
              key={k}
              type="button"
              className={`cal-day heat-${heat(count)} ${outside ? "outside" : ""} ${k === todayKey ? "today" : ""} ${k === date && open ? "picked" : ""}`}
              onClick={() => {
                setDate(k);
                setOpen(true);
              }}
              title={`${d.toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long" })} · ${count} révision${count > 1 ? "s" : ""}${daySessions.length ? ` · ${daySessions.length} session(s) prévue(s)` : ""}`}
            >
              <span>{d.getDate()}</span>
              {daySessions.length ? <i className={`cal-dot ${daySessions.every((s) => s.done) ? "done" : ""}`} /> : null}
            </button>
          );
        })}
      </div>
      <div className="cal-legend muted small">
        <span>Moins</span>
        {[0, 1, 2, 3, 4].map((h) => (
          <i key={h} className={`cal-swatch heat-${h}`} />
        ))}
        <span>Plus</span>
        <span className="cal-legend-sep">
          <i className="cal-dot" /> session prévue
        </span>
      </div>

      {!open ? (
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          + Planifier une session de révision
        </button>
      ) : (
        <form className="plan-form fade-up" onSubmit={add}>
          <label>
            Cours
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {courses.length === 0 ? <option value="">Révision libre</option> : null}
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <div className="plan-row">
            <label>
              Jour
              <input type="date" value={date} min={todayKey} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label>
              Heure
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </label>
            <label>
              Durée
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} min
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row-center">
            <button type="button" className="btn btn-ghost btn-inline" onClick={() => setOpen(false)}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary btn-inline" disabled={saving}>
              {saving ? "Enregistrement…" : "Planifier"}
            </button>
          </div>
          {error && <p className="notice error">{error}</p>}
        </form>
      )}

      <div className="stack" style={{ gap: 10 }}>
        <h3 style={{ fontSize: "1.05rem" }}>Prochaines sessions</h3>
        {upcoming.length === 0 ? <p className="muted small">Aucune session prévue. Planifie-en une : c'est le meilleur moyen de tenir le rythme.</p> : null}
        {upcoming.slice(0, 6).map((s) => {
          const start = new Date(s.starts_at);
          const ev = event(s);
          return (
            <div key={s.id} className={`session-item ${s.done ? "is-done" : ""} ${justAdded === s.id ? "pop-in highlight" : ""}`}>
              <button type="button" className={`check ${s.done ? "on" : ""}`} onClick={() => toggleDone(s)} aria-label={s.done ? "Marquer comme à faire" : "Marquer comme faite"}>
                {s.done ? "✓" : ""}
              </button>
              <div className="session-info">
                <strong className="clamp-1">{s.title}</strong>
                <span className="muted small">
                  {start.toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long" })} · {start.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })} · {s.duration_min} min
                </span>
                {justAdded === s.id ? <span className="small">Ajoute-la à ton agenda pour recevoir un rappel :</span> : null}
                <div className="session-actions">
                  <a className="chip" href={googleCalendarUrl(ev)} target="_blank" rel="noopener noreferrer">
                    Google Agenda
                  </a>
                  <button type="button" className="chip" onClick={() => downloadIcs(ev)}>
                    Apple / Outlook (.ics)
                  </button>
                  {s.document_id ? (
                    <Link className="chip strong" href={`/study/${s.document_id}`}>
                      Commencer
                    </Link>
                  ) : null}
                  <button type="button" className="chip ghost" onClick={() => remove(s)}>
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
