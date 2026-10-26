// Message d'erreur lisible renvoyé par une Edge Function ({ error }).
export async function readFunctionError(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.json();
      if (body?.error) return String(body.error);
    } catch {
      // réponse non JSON
    }
  }
  return fallback;
}
