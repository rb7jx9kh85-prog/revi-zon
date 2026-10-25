export type FlashcardContent = { front: string; back: string; topic?: string };
export type ClozeContent = { text: string; answers: string[]; hint?: string; topic?: string };
export type QuizContent = {
  question: string;
  options: string[];
  correct_index: number;
  explanation?: string;
  topic?: string;
};

export type ExerciseKind = "flashcard" | "cloze" | "quiz";

export type StudyItem<C> = {
  id: string;
  difficulty: number;
  content: C;
  dueAt: string | null;
  repetitions: number;
};

export type DocumentStatus = "uploaded" | "processing" | "ready" | "failed";

export type StudyDocument = {
  id: string;
  title: string;
  status: DocumentStatus;
  source: string;
  summary: string | null;
  error_message: string | null;
  suggested_questions: string[] | null;
  created_at: string;
};
