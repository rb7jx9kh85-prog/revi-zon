import { Fragment, type ReactNode } from "react";

// Rendu Markdown minimal et sûr (aucun HTML injecté) : titres, listes,
// paragraphes, **gras**, *italique* et `code`.
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("**")) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    else nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export type Block =
  | { type: "h"; level: 1 | 2 | 3; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "p"; text: string };

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "p", text: paragraph.join(" ") });
    paragraph = [];
  };

  for (const raw of source.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);

    if (!line) {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ type: "h", level: Math.min(3, heading[1].length) as 1 | 2 | 3, text: heading[2] });
    } else if (bullet || numbered) {
      flush();
      const type = bullet ? "ul" : "ol";
      const text = (bullet ?? numbered)![1];
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === type) prev.items.push(text);
      else blocks.push({ type, items: [text] });
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={`md ${className ?? ""}`}>
      {parseMarkdown(source).map((block, i) => {
        const key = `b${i}`;
        if (block.type === "h") {
          const Tag = block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
          return <Tag key={key}>{inline(block.text, key)}</Tag>;
        }
        if (block.type === "p") return <p key={key}>{inline(block.text, key)}</p>;
        const List = block.type;
        return (
          <List key={key}>
            {block.items.map((item, j) => (
              <li key={`${key}-${j}`}>
                <Fragment>{inline(item, `${key}-${j}`)}</Fragment>
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
