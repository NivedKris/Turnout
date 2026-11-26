import { Fragment, type ReactNode } from "react";

/**
 * Minimal, safe markdown for copilot answers: headings, bold, inline code,
 * bullets, numbered lists, rules and tool tags "(get_overview)". No raw HTML.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|[(\[【](?:get|list|compare|suggest|run|calculate|propose)_[a-z_]+(?:,\s*[a-z_]+)*[)\]】])/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={`${key}-${i++}`} className="font-semibold text-fg">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={`${key}-${i++}`} className="bg-surface-2 px-1 font-mono text-[0.9em]">{t.slice(1, -1)}</code>);
    else
      out.push(
        <span key={`${key}-${i++}`} className="ml-0.5 whitespace-nowrap border border-line px-1 align-middle font-mono text-[9px] uppercase tracking-wider text-fg-3">
          {t.slice(1, -1)}
        </span>,
      );
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list;
    const Tag = L.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`l${blocks.length}`} className={`my-1 flex flex-col gap-1 pl-5 ${L.ordered ? "list-decimal" : "list-[square]"} marker:text-fg-3`}>
        {L.items.map((it, j) => (
          <li key={j}>{inline(it, `li${blocks.length}-${j}`)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || num) {
      const ordered = Boolean(num);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? num)![1]!);
      return;
    }
    flush();
    if (!line.trim()) return;
    if (/^-{3,}$/.test(line.trim())) {
      blocks.push(<hr key={`h${idx}`} className="my-2 border-line" />);
      return;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push(
        <p key={`h${idx}`} className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-fg-2">
          {h[2]}
        </p>,
      );
      return;
    }
    blocks.push(
      <p key={`p${idx}`} className="leading-relaxed">
        {inline(line, `p${idx}`)}
      </p>,
    );
  });
  flush();
  return <div className="flex flex-col gap-1.5 text-[14px] text-fg-2">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
