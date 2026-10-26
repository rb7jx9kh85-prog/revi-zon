import { createClient } from "@/lib/supabase/server";
import type { ExerciseKind, StudyDocument, StudyItem } from "./types";

type ExerciseRow = { id: string; difficulty: number; content: unknown };
type ScheduleRow = { exercise_id: string; due_at: string; repetitions: number };

export async function loadDocument(id: string): Promise<StudyDocument | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("id, title, status, source, summary, error_message, suggested_questions, created_at")
    .eq("id", id)
    .maybeSingle();
  return (data as StudyDocument | null) ?? null;
}

// Exercices d'un document, ceux à réviser en premier (répétition espacée).
export async function loadExercises<C>(documentId: string, kind: ExerciseKind): Promise<StudyItem<C>[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("exercises")
    .select("id, difficulty, content")
    .eq("document_id", documentId)
    .eq("kind", kind)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as ExerciseRow[];
  if (rows.length === 0) return [];

  const { data: schedData } = await supabase
    .from("review_schedule")
    .select("exercise_id, due_at, repetitions")
    .in(
      "exercise_id",
      rows.map((r) => r.id),
    );
  const schedule = new Map(((schedData ?? []) as ScheduleRow[]).map((s) => [s.exercise_id, s]));

  const items = rows.map((r) => {
    const s = schedule.get(r.id);
    return {
      id: r.id,
      difficulty: r.difficulty,
      content: r.content as C,
      dueAt: s?.due_at ?? null,
      repetitions: s?.repetitions ?? 0,
    };
  });

  const now = Date.now();
  const due = (i: StudyItem<C>) => (i.dueAt ? new Date(i.dueAt).getTime() : 0);
  return items.sort((a, b) => {
    const aDue = due(a) <= now, bDue = due(b) <= now;
    if (aDue !== bDue) return aDue ? -1 : 1;
    return due(a) - due(b);
  });
}

export async function countExercises(documentId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("exercises").select("kind").eq("document_id", documentId);
  const counts = { flashcard: 0, cloze: 0, quiz: 0 };
  for (const row of (data ?? []) as { kind: ExerciseKind }[]) counts[row.kind] += 1;
  return counts;
}
