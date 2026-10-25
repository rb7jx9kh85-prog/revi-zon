// Compare une réponse tapée à la réponse attendue, sans tenir compte
// des majuscules, des accents, des espaces en trop ni de la ponctuation finale.
export function normalizeAnswer(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*[.,;:!?]+$/g, "");
}

export function isSameAnswer(given: string, expected: string): boolean {
  const a = normalizeAnswer(given);
  const b = normalizeAnswer(expected);
  if (!a) return false;
  if (a === b) return true;
  // Tolère « le/la/l'/les » en début de réponse
  const strip = (s: string) => s.replace(/^(le |la |les |l'|un |une |des )/, "");
  return strip(a) === strip(b);
}

// Découpe "La {{1}} capte la {{2}}" en morceaux de texte et numéros de trou.
export function splitCloze(text: string): (string | number)[] {
  const parts: (string | number)[] = [];
  const re = /\{\{(\d+)\}\}/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(Number(match[1]) - 1);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
