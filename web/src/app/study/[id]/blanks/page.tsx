import type { Metadata } from "next";
import { ClozeRunner } from "@/components/cloze-runner";
import { loadExercises } from "@/lib/study";
import type { ClozeContent } from "@/lib/types";

export const metadata: Metadata = { title: "Textes à trous" };

export default async function BlanksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const items = await loadExercises<ClozeContent>(id, "cloze");
  return <ClozeRunner items={items} />;
}
