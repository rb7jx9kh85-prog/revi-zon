"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProfileFormState = { ok: boolean; message: string } | null;

export async function updateProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const displayName = String(formData.get("display_name") ?? "").trim().slice(0, 80);
  const schoolLevel = String(formData.get("school_level") ?? "").trim().slice(0, 60);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Ta session a expiré, reconnecte-toi." };

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName || null, school_level: schoolLevel || null, onboarding_completed: true })
    .eq("id", user.id);

  if (error) return { ok: false, message: "L'enregistrement a échoué. Réessaie." };
  revalidatePath("/dashboard");
  return { ok: true, message: "Profil enregistré." };
}
