// Génération du PDF de révision dans le navigateur (@react-pdf/renderer).
// Ce module est chargé à la demande pour ne pas alourdir les pages.
import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { parseMarkdown } from "@/components/markdown";
import type { ClozeContent, FlashcardContent, QuizContent } from "@/lib/types";
import { PDF_THEMES, type PdfTheme, type PdfThemeId } from "./themes";

export type PdfSection = "summary" | "sheet" | "flashcards" | "quiz" | "cloze";

export type PdfData = {
  title: string;
  shortSummary: string | null;
  summaryMd: string | null;
  sheetMd: string | null;
  flashcards: FlashcardContent[];
  quiz: QuizContent[];
  cloze: ClozeContent[];
};

const FONT_BASE = "https://cdn.jsdelivr.net/fontsource/fonts";
let fontsReady: Promise<boolean> | null = null;

// Polices du site (Figtree, Bricolage Grotesque) ; repli sur Helvetica si le CDN ne répond pas.
function loadFonts(): Promise<boolean> {
  fontsReady ??= (async () => {
    const files = {
      body400: `${FONT_BASE}/figtree@latest/latin-400-normal.ttf`,
      body700: `${FONT_BASE}/figtree@latest/latin-700-normal.ttf`,
      body400i: `${FONT_BASE}/figtree@latest/latin-400-italic.ttf`,
      display: `${FONT_BASE}/bricolage-grotesque@latest/latin-800-normal.ttf`,
    };
    try {
      const checks = await Promise.all(Object.values(files).map((u) => fetch(u, { method: "HEAD" }).then((r) => r.ok)));
      if (checks.some((ok) => !ok)) return false;
      Font.register({
        family: "Body",
        fonts: [
          { src: files.body400 },
          { src: files.body700, fontWeight: 700 },
          { src: files.body400i, fontStyle: "italic" },
        ],
      });
      Font.register({ family: "Display", src: files.display, fontWeight: 800 });
      Font.registerHyphenationCallback((word) => [word]);
      return true;
    } catch {
      return false;
    }
  })();
  return fontsReady;
}

// Caractères absents des polices latines : on les remplace par un équivalent lisible.
const REPLACEMENTS: [RegExp, string][] = [
  [/→|⟶|⇒/g, "->"],
  [/←|⇐/g, "<-"],
  [/↔|⇔/g, "<->"],
  [/≈/g, "~"],
  [/≤/g, "<="],
  [/≥/g, ">="],
  [/≠/g, "!="],
  [/√/g, "racine de "],
  [/∞/g, "infini"],
  [/\p{Extended_Pictographic}|\uFE0F/gu, ""],
];

function clean(text: string) {
  let out = text.replace(/[\u2080-\u2089]/g, (c) => String(c.charCodeAt(0) - 0x2080));
  for (const [re, rep] of REPLACEMENTS) out = out.replace(re, rep);
  return out;
}

type Seg = { text: string; bold?: boolean; italic?: boolean };

function segments(text: string): Seg[] {
  const out: Seg[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const t = m[0];
    if (t.startsWith("**")) out.push({ text: t.slice(2, -2), bold: true });
    else if (t.startsWith("`")) out.push({ text: t.slice(1, -1), bold: true });
    else out.push({ text: t.slice(1, -1), italic: true });
    last = m.index + t.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.map((s) => ({ ...s, text: clean(s.text) }));
}

function makeStyles(t: PdfTheme, custom: boolean) {
  const body = custom ? "Body" : "Helvetica";
  const display = custom ? "Display" : "Helvetica-Bold";
  return StyleSheet.create({
    page: { backgroundColor: t.page, color: t.ink, fontFamily: body, fontSize: 10.5, lineHeight: 1.5, paddingTop: 54, paddingBottom: 52, paddingHorizontal: 44 },
    header: { position: "absolute", top: 20, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: t.muted },
    footer: { position: "absolute", bottom: 22, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: t.muted },
    brandDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: t.accents[0], marginRight: 5, marginTop: 1 },
    coverWrap: { minHeight: 640, justifyContent: "center", position: "relative" },
    blob: { position: "absolute", borderRadius: 999, opacity: t.id === "minimal" ? 0 : 0.9 },
    kicker: { fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: t.muted, fontWeight: 700 },
    coverTitle: { fontFamily: display, fontSize: 36, lineHeight: 1.1, marginTop: 10, marginBottom: 14 },
    highlight: { backgroundColor: t.accents[0], color: t.onAccent, paddingHorizontal: 4 },
    coverText: { fontSize: 12, color: t.muted, maxWidth: 420 },
    pills: { flexDirection: "row", flexWrap: "wrap", marginTop: 22 },
    pill: { borderWidth: 1.5, borderColor: t.border, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, marginRight: 8, marginBottom: 8, fontSize: 9, fontWeight: 700 },
    sectionHead: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
    sectionNum: { width: 30, height: 30, borderRadius: 8, borderWidth: 1.5, borderColor: t.border, alignItems: "center", justifyContent: "center", marginRight: 10 },
    sectionNumText: { fontFamily: display, fontSize: 12, color: t.onAccent },
    sectionTitle: { fontFamily: display, fontSize: 22 },
    h2: { fontFamily: display, fontSize: 15, marginTop: 12, marginBottom: 4 },
    h3: { fontFamily: display, fontSize: 12.5, marginTop: 8, marginBottom: 3 },
    bar: { height: 3, width: 46, borderRadius: 2, marginBottom: 6 },
    p: { marginBottom: 6 },
    li: { flexDirection: "row", marginBottom: 3, paddingLeft: 4 },
    bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 5, marginRight: 8 },
    num: { width: 16, fontWeight: 700 },
    liText: { flex: 1 },
    bold: { fontWeight: 700 },
    italic: { fontStyle: "italic" },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
    fc: { width: "48.5%", borderWidth: 1.5, borderColor: t.border, borderRadius: 10, marginBottom: 10, backgroundColor: t.card },
    fcFront: { padding: 9, borderTopLeftRadius: 9, borderTopRightRadius: 9, fontWeight: 700, color: t.onAccent },
    fcBack: { padding: 9, fontSize: 9.5 },
    q: { borderWidth: 1.5, borderColor: t.border, borderRadius: 10, padding: 10, marginBottom: 10, backgroundColor: t.card },
    qTitle: { fontWeight: 700, marginBottom: 6 },
    opt: { flexDirection: "row", marginBottom: 3 },
    optKey: { width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderColor: t.border, fontSize: 8, fontWeight: 700, textAlign: "center", paddingTop: 2.5, marginRight: 7 },
    answers: { borderWidth: 1.5, borderStyle: "dashed", borderColor: t.border, borderRadius: 10, padding: 10, marginTop: 6 },
    small: { fontSize: 9, color: t.muted },
  });
}

type Styles = ReturnType<typeof makeStyles>;

function Rich({ text, s }: { text: string; s: Styles }) {
  return (
    <>
      {segments(text).map((seg, i) => (
        <Text key={i} style={[seg.bold ? s.bold : {}, seg.italic ? s.italic : {}]}>
          {seg.text}
        </Text>
      ))}
    </>
  );
}

function MarkdownPdf({ source, s, t }: { source: string; s: Styles; t: PdfTheme }) {
  return (
    <View>
      {parseMarkdown(source).map((b, i) => {
        if (b.type === "h") {
          const color = t.accents[i % 4];
          return (
            <View key={i} wrap={false}>
              <Text style={b.level <= 2 ? s.h2 : s.h3}>
                <Rich text={b.text} s={s} />
              </Text>
              {b.level <= 2 ? <View style={[s.bar, { backgroundColor: color }]} /> : null}
            </View>
          );
        }
        if (b.type === "p")
          return (
            <Text key={i} style={s.p}>
              <Rich text={b.text} s={s} />
            </Text>
          );
        return (
          <View key={i} style={{ marginBottom: 6 }}>
            {b.items.map((item, j) => (
              <View key={j} style={s.li} wrap={false}>
                {b.type === "ul" ? <View style={[s.bullet, { backgroundColor: t.accents[(j + 1) % 4] }]} /> : <Text style={s.num}>{j + 1}.</Text>}
                <Text style={s.liText}>
                  <Rich text={item} s={s} />
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function SectionHead({ n, title, s, color }: { n: number; title: string; s: Styles; color: string }) {
  return (
    <View style={s.sectionHead} wrap={false}>
      <View style={[s.sectionNum, { backgroundColor: color }]}>
        <Text style={s.sectionNumText}>{String(n).padStart(2, "0")}</Text>
      </View>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function clozeText(c: ClozeContent) {
  return c.text.replace(/\{\{\d+\}\}/g, "________");
}

function StudyPdf({ data, theme, sections, s }: { data: PdfData; theme: PdfTheme; sections: PdfSection[]; s: Styles }) {
  const t = theme;
  const date = new Date().toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric" });
  const has = (x: PdfSection) => sections.includes(x);
  let n = 0;

  const Frame = ({ children, label }: { children: React.ReactNode; label: string }) => (
    <Page size="A4" style={s.page}>
      <View style={s.header} fixed>
        <View style={{ flexDirection: "row" }}>
          <View style={s.brandDot} />
          <Text>Revizuno</Text>
        </View>
        <Text>{clean(data.title).slice(0, 70)}</Text>
      </View>
      {children}
      <View style={s.footer} fixed>
        <Text>{label}</Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  );

  return (
    <Document title={data.title} author="Revizuno" creator="Revizuno" producer="Revizuno">
      <Frame label={date}>
        <View style={s.coverWrap}>
          <View style={[s.blob, { width: 180, height: 180, backgroundColor: t.accents[1], top: -10, right: -40 }]} />
          <View style={[s.blob, { width: 90, height: 90, backgroundColor: t.accents[2], top: 150, right: 110 }]} />
          <View style={[s.blob, { width: 120, height: 120, backgroundColor: t.accents[3], bottom: 10, left: -60 }]} />
          <Text style={s.kicker}>Fiche de révision · {date}</Text>
          <Text style={s.coverTitle}>
            <Text style={s.highlight}>{clean(data.title)}</Text>
          </Text>
          {data.shortSummary ? <Text style={s.coverText}>{clean(data.shortSummary)}</Text> : null}
          <View style={s.pills}>
            {has("flashcards") && data.flashcards.length ? <Text style={s.pill}>{data.flashcards.length} flashcards</Text> : null}
            {has("quiz") && data.quiz.length ? <Text style={s.pill}>{data.quiz.length} questions de quiz</Text> : null}
            {has("cloze") && data.cloze.length ? <Text style={s.pill}>{data.cloze.length} textes à trous</Text> : null}
            <Text style={[s.pill, { backgroundColor: t.accents[0], color: t.onAccent }]}>Généré par Revizuno</Text>
          </View>
        </View>
      </Frame>

      {has("summary") && data.summaryMd ? (
        <Frame label="Résumé">
          <SectionHead n={++n} title="Résumé" s={s} color={t.accents[0]} />
          <MarkdownPdf source={data.summaryMd} s={s} t={t} />
        </Frame>
      ) : null}

      {has("sheet") && data.sheetMd ? (
        <Frame label="Fiche de révision">
          <SectionHead n={++n} title="Fiche de révision" s={s} color={t.accents[2]} />
          <MarkdownPdf source={data.sheetMd} s={s} t={t} />
        </Frame>
      ) : null}

      {has("flashcards") && data.flashcards.length ? (
        <Frame label="Flashcards">
          <SectionHead n={++n} title="Flashcards" s={s} color={t.accents[1]} />
          <Text style={[s.small, { marginBottom: 10 }]}>Cache la réponse avec ta main et teste-toi.</Text>
          <View style={s.grid}>
            {data.flashcards.map((c, i) => (
              <View key={i} style={s.fc} wrap={false}>
                <Text style={[s.fcFront, { backgroundColor: t.accents[i % 4] }]}>{clean(c.front)}</Text>
                <Text style={s.fcBack}>{clean(c.back)}</Text>
              </View>
            ))}
          </View>
        </Frame>
      ) : null}

      {has("quiz") && data.quiz.length ? (
        <Frame label="Quiz">
          <SectionHead n={++n} title="Quiz" s={s} color={t.accents[3]} />
          {data.quiz.map((q, i) => (
            <View key={i} style={s.q} wrap={false}>
              <Text style={s.qTitle}>
                {i + 1}. {clean(q.question)}
              </Text>
              {q.options.map((o, j) => (
                <View key={j} style={s.opt}>
                  <Text style={s.optKey}>{String.fromCharCode(65 + j)}</Text>
                  <Text style={s.liText}>{clean(o)}</Text>
                </View>
              ))}
            </View>
          ))}
          <View style={s.answers} wrap={false}>
            <Text style={[s.h3, { marginTop: 0 }]}>Corrigé</Text>
            {data.quiz.map((q, i) => (
              <Text key={i} style={{ marginBottom: 3 }}>
                <Text style={s.bold}>
                  {i + 1}. {String.fromCharCode(65 + q.correct_index)}
                </Text>
                {q.explanation ? ` · ${clean(q.explanation)}` : ""}
              </Text>
            ))}
          </View>
        </Frame>
      ) : null}

      {has("cloze") && data.cloze.length ? (
        <Frame label="Textes à trous">
          <SectionHead n={++n} title="Textes à trous" s={s} color={t.accents[2]} />
          {data.cloze.map((c, i) => (
            <View key={i} style={s.q} wrap={false}>
              <Text>
                <Text style={s.bold}>{i + 1}. </Text>
                {clean(clozeText(c))}
              </Text>
              {c.hint ? <Text style={[s.small, { marginTop: 4 }]}>Indice : {clean(c.hint)}</Text> : null}
            </View>
          ))}
          <View style={s.answers} wrap={false}>
            <Text style={[s.h3, { marginTop: 0 }]}>Corrigé</Text>
            {data.cloze.map((c, i) => (
              <Text key={i} style={{ marginBottom: 3 }}>
                <Text style={s.bold}>{i + 1}. </Text>
                {clean(c.answers.join(" · "))}
              </Text>
            ))}
          </View>
        </Frame>
      ) : null}
    </Document>
  );
}

export async function renderStudyPdf(data: PdfData, themeId: PdfThemeId, sections: PdfSection[]): Promise<Blob> {
  const theme = PDF_THEMES.find((t) => t.id === themeId) ?? PDF_THEMES[0];
  const custom = await loadFonts();
  try {
    return await pdf(<StudyPdf data={data} theme={theme} sections={sections} s={makeStyles(theme, custom)} />).toBlob();
  } catch (err) {
    if (!custom) throw err;
    // Police distante illisible : on refait le PDF avec les polices intégrées
    console.warn("PDF : repli sur Helvetica", err);
    return pdf(<StudyPdf data={data} theme={theme} sections={sections} s={makeStyles(theme, false)} />).toBlob();
  }
}
