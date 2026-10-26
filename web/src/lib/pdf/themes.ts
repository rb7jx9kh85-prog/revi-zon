// Styles de PDF proposés à l'étudiant (partagés par l'aperçu et le rendu PDF).
export type PdfThemeId = "pop" | "pastel" | "minimal" | "nuit";

export type PdfTheme = {
  id: PdfThemeId;
  label: string;
  description: string;
  page: string;
  ink: string;
  muted: string;
  card: string;
  border: string;
  accents: [string, string, string, string];
  onAccent: string;
};

export const PDF_THEMES: PdfTheme[] = [
  {
    id: "pop",
    label: "Pop",
    description: "Les couleurs fluo de Revizuno",
    page: "#fffdf6",
    ink: "#141b3d",
    muted: "#5a6283",
    card: "#ffffff",
    border: "#141b3d",
    accents: ["#ffe14d", "#ff84b7", "#7cc0ff", "#52dda2"],
    onAccent: "#141b3d",
  },
  {
    id: "pastel",
    label: "Pastel",
    description: "Doux et aéré",
    page: "#fcfaff",
    ink: "#3b3355",
    muted: "#7d7598",
    card: "#ffffff",
    border: "#d9d0f0",
    accents: ["#ffe9a8", "#ffc8dd", "#cde7ff", "#c9f2dc"],
    onAccent: "#3b3355",
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Noir et blanc, idéal à imprimer",
    page: "#ffffff",
    ink: "#111111",
    muted: "#666666",
    card: "#ffffff",
    border: "#111111",
    accents: ["#eeeeee", "#e2e2e2", "#f4f4f4", "#e8e8e8"],
    onAccent: "#111111",
  },
  {
    id: "nuit",
    label: "Nuit",
    description: "Fond sombre et néons",
    page: "#0e1330",
    ink: "#eceffe",
    muted: "#9ca4ca",
    card: "#182045",
    border: "#3a4580",
    accents: ["#ffe14d", "#ff84b7", "#7cc0ff", "#52dda2"],
    onAccent: "#141b3d",
  },
];
