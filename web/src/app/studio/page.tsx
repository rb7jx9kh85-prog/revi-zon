import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StudioChat } from "@/components/studio-chat";
import { createClient } from "@/lib/supabase/server";
import type { ChatThread } from "@/lib/types";

export const metadata: Metadata = { title: "Studio Revi" };

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ t?: string; doc?: string }> }) {
  const { t, doc } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/studio");

  const [threadsRes, docsRes, profileRes] = await Promise.all([
    supabase.from("chat_threads").select("id, title, document_id, updated_at").order("updated_at", { ascending: false }).limit(60),
    supabase.from("documents").select("id, title").eq("status", "ready").order("created_at", { ascending: false }),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  const threads = (threadsRes.data ?? []) as ChatThread[];
  const courses = (docsRes.data ?? []) as { id: string; title: string }[];
  const name = (profileRes.data as { display_name: string | null } | null)?.display_name || user.email?.split("@")[0] || "toi";

  return (
    <StudioChat
      name={name}
      threads={threads}
      courses={courses}
      initialThreadId={t && threads.some((x) => x.id === t) ? t : null}
      initialCourseId={doc && courses.some((c) => c.id === doc) ? doc : null}
    />
  );
}
