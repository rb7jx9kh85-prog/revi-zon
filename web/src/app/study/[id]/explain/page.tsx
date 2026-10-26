import type { Metadata } from "next";
import { ExplainRunner } from "@/components/explain-runner";
import { loadExercises } from "@/lib/study";
import type { FlashcardContent } from "@/lib/types";

export const metadata: Metadata = { title: "Explique avec tes mots" };

export default async function ExplainPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cards = await loadExercises<FlashcardContent>(id, "flashcard");
  return <ExplainRunner documentId={id} cards={cards} />;
}
