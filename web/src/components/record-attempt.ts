import { createClient } from "@/lib/supabase/client";

// Enregistre une réponse (note SM-2 de 0 à 5). Les erreurs réseau ne bloquent pas la révision.
export async function recordAttempt(exerciseId: string, quality: number, answer?: unknown, responseMs?: number) {
  try {
    const supabase = createClient();
    const { error } = await supabase.rpc("record_attempt", {
      p_exercise_id: exerciseId,
      p_quality: Math.max(0, Math.min(5, Math.round(quality))),
      p_answer: answer ?? null,
      p_response_ms: responseMs != null ? Math.max(0, Math.round(responseMs)) : null,
    });
    if (error) console.warn("record_attempt", error.message);
  } catch (err) {
    console.warn("record_attempt", err);
  }
}
