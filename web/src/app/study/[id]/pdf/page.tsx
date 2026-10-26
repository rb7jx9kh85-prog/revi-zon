import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PdfStudio } from "@/components/pdf-studio";
import { EmptyExercises } from "@/components/session-progress";
import { loadExercises } from "@/lib/study";
import { createClient } from "@/lib/supabase/server";
import type { ClozeContent, FlashcardContent, QuizContent } from "@/lib/types";

export const metadata: Metadata = { title: "Export PDF" };

export default async function PdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select("id, title, status, summary, summary_md").eq("id", id).maybeSingle();
  const doc = data as { id: string; title: string; status: string; summary: string | null; summary_md: string | null } | null;
  if (!doc) notFound();
  if (doc.status !== "ready") return <EmptyExercises what="PDF" />;

  const [sheetRes, flashcards, quiz, cloze] = await Promise.all([
    supabase.from("revision_sheets").select("content_md").eq("document_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    loadExercises<FlashcardContent>(id, "flashcard"),
    loadExercises<QuizContent>(id, "quiz"),
    loadExercises<ClozeContent>(id, "cloze"),
  ]);

  return (
    <PdfStudio
      documentId={doc.id}
      data={{
        title: doc.title,
        shortSummary: doc.summary,
        summaryMd: doc.summary_md,
        sheetMd: (sheetRes.data as { content_md: string } | null)?.content_md ?? null,
        flashcards: flashcards.map((f) => f.content),
        quiz: quiz.map((q) => q.content),
        cloze: cloze.map((c) => c.content),
      }}
    />
  );
}
