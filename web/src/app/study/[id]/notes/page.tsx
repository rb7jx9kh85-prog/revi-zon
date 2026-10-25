import type { Metadata } from "next";
import { Markdown } from "@/components/markdown";
import { EmptyExercises } from "@/components/session-progress";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Fiche de révision" };

export default async function NotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("revision_sheets")
    .select("title, content_md")
    .eq("document_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sheet = data as { title: string; content_md: string } | null;

  if (!sheet) return <EmptyExercises what="fiche de révision" />;

  return (
    <article className="sheet">
      <h1 className="sheet-title">{sheet.title}</h1>
      <Markdown source={sheet.content_md} />
    </article>
  );
}
