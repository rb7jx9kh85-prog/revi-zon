import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyExercises } from "@/components/session-progress";
import { SummaryView } from "@/components/summary-view";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Résumé" };

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select("id, title, status, summary_md").eq("id", id).maybeSingle();
  const doc = data as { id: string; title: string; status: string; summary_md: string | null } | null;
  if (!doc) notFound();
  if (doc.status !== "ready") return <EmptyExercises what="résumé" />;
  return <SummaryView documentId={doc.id} title={doc.title} initial={doc.summary_md} />;
}
