import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UploadForm } from "@/components/upload-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Nouveau cours" };

export default async function NewCoursePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/new");

  const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle();
  const { data: limits } = await supabase.from("plan_limits").select("plan, max_file_size_mb");
  const plan = (profile?.plan as string | undefined) ?? "free";
  const maxMb = ((limits ?? []) as { plan: string; max_file_size_mb: number }[]).find((l) => l.plan === plan)?.max_file_size_mb ?? 10;

  return (
    <main className="page narrow">
      <Link href="/dashboard" className="muted back-link">
        ← Mes cours
      </Link>
      <div className="stack" style={{ gap: 8 }}>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 2.8rem)" }}>
          Nouveau <span className="mark">cours</span>
        </h1>
        <p className="muted">Revi en tire une fiche, des flashcards, des textes à trous et un quiz, adaptés à ton niveau.</p>
      </div>
      <UploadForm userId={user.id} maxMb={maxMb} />
    </main>
  );
}
