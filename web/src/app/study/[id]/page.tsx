import Link from "next/link";
import { notFound } from "next/navigation";
import { ProcessingStatus } from "@/components/processing-status";
import { countExercises, loadDocument } from "@/lib/study";
import { createClient } from "@/lib/supabase/server";

export default async function StudyOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await loadDocument(id);
  if (!doc) notFound();

  if (doc.status !== "ready") {
    return <ProcessingStatus documentId={doc.id} status={doc.status} error={doc.error_message} />;
  }

  const counts = await countExercises(id);
  const supabase = await createClient();
  const { data: exercises } = await supabase.from("exercises").select("id").eq("document_id", id);
  const ids = ((exercises ?? []) as { id: string }[]).map((e) => e.id);
  const { data: schedule } = ids.length
    ? await supabase.from("review_schedule").select("due_at, repetitions").in("exercise_id", ids)
    : { data: [] as { due_at: string; repetitions: number }[] };
  const rows = (schedule ?? []) as { due_at: string; repetitions: number }[];
  const total = ids.length;
  const mastered = rows.filter((r) => r.repetitions >= 2).length;
  const due = rows.filter((r) => new Date(r.due_at).getTime() <= Date.now()).length;
  const mastery = total ? Math.round((mastered / total) * 100) : 0;

  const methods = [
    { href: "flashcards", label: "Flashcards", count: counts.flashcard, unit: "cartes", color: "var(--accent)" },
    { href: "quiz", label: "Quiz", count: counts.quiz, unit: "questions", color: "var(--accent-4)" },
    { href: "blanks", label: "Textes à trous", count: counts.cloze, unit: "phrases", color: "var(--accent-2)" },
    { href: "notes", label: "Fiche de révision", count: null, unit: "", color: "var(--accent-3)" },
  ];

  return (
    <div className="stack" style={{ gap: 24 }}>
      {doc.summary ? (
        <section className="card stack">
          <h2 style={{ fontSize: "1.3rem" }}>En bref</h2>
          <p>{doc.summary}</p>
        </section>
      ) : null}

      <section className="grid-3">
        <div className="card stat-card">
          <span className="stat">{mastery}%</span>
          <span className="muted">maîtrisé</span>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${mastery}%` }} />
          </div>
        </div>
        <div className="card stat-card">
          <span className="stat">{due}</span>
          <span className="muted">à revoir aujourd'hui</span>
        </div>
        <div className="card stat-card">
          <span className="stat">{total}</span>
          <span className="muted">exercices au total</span>
        </div>
      </section>

      <section className="method-grid">
        {methods.map((m) => (
          <Link key={m.href} href={`/study/${id}/${m.href}`} className="method-card">
            <span className="method-swatch" style={{ background: m.color }} />
            <strong>{m.label}</strong>
            <span className="muted">{m.count != null ? `${m.count} ${m.unit}` : "L'essentiel sur une page"}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
