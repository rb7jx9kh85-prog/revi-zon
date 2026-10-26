import type { Metadata } from "next";
import { QuizRunner } from "@/components/quiz-runner";
import { loadExercises } from "@/lib/study";
import type { QuizContent } from "@/lib/types";

export const metadata: Metadata = { title: "Quiz" };

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const questions = await loadExercises<QuizContent>(id, "quiz");
  return <QuizRunner questions={questions} />;
}
