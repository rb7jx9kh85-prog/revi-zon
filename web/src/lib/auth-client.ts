// Outils partagés par les formulaires de connexion (navigateur uniquement).

export function callbackUrl(next: string) {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", next);
  return url.toString();
}

export function readableAuthError(message: string, code?: string) {
  // Limite d'envoi d'e-mails du projet (service e-mail de Supabase)
  if (code === "over_email_send_rate_limit" || /email rate limit/i.test(message))
    return "Trop de liens de connexion envoyés en ce moment. Réessaie dans quelques minutes.";
  // Délai entre deux liens pour une même adresse
  if (/only request this after|over_request_rate_limit|rate limit|too many/i.test(`${code ?? ""} ${message}`))
    return "Un lien vient déjà d'être envoyé. Vérifie ta boîte mail (et les spams) ou réessaie dans une minute.";
  if (/invalid.*email/i.test(message)) return "Cette adresse e-mail n'est pas valide.";
  return "La connexion a échoué. Réessaie dans un instant.";
}
