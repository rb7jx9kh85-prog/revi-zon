import { notFound, redirect } from "next/navigation";
import { StudyShell } from "@/components/study-shell";
import { countExercises, loadDocument } from "@/lib/study";
import { createClient } from "@/lib/supabase/server";

export default async function StudyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/study/${id}`);

  const doc = await loadDocument(id);
  if (!doc) notFound();

  const counts = doc.status === "ready" ? await countExercises(id) : null;

  return (
    <StudyShell
      documentId={doc.id}
      title={doc.title}
      ready={doc.status === "ready"}
      suggestions={doc.suggested_questions ?? []}
      counts={{
        flashcards: counts?.flashcard ?? null,
        quiz: counts?.quiz ?? null,
        blanks: counts?.cloze ?? null,
      }}
    >
      {children}
    </StudyShell>
  );
}
