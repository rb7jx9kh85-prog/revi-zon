import type { Metadata } from "next";
import { FlashcardDeck } from "@/components/flashcard-deck";
import { loadExercises } from "@/lib/study";
import type { FlashcardContent } from "@/lib/types";

export const metadata: Metadata = { title: "Flashcards" };

export default async function FlashcardsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cards = await loadExercises<FlashcardContent>(id, "flashcard");
  return <FlashcardDeck cards={cards} />;
}
