import { Fragment } from "react";
import { cn } from "@/lib/utils";

/**
 * A small, safe Markdown renderer for briefs, agendas and placement tasks written by staff.
 * It builds React elements (never HTML strings), so nothing in the text can run as script.
 * Supports: # headings, - / 1. lists, ``` code blocks, `code`, **bold**, *italic*,
 * [links](https://…) (https only), blank-line paragraphs.
 */
export function Markdown({ source, className }: { source: string | null | undefined; className?: string }) {
  if (!source?.trim()) return null;
  return <div className={cn("space-y-3 text-sm leading-relaxed", className)}>{blocks(source)}</div>;
}

function blocks(src: string) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trimStart().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) code.push(lines[i++]);
      i++;
      out.push(
        <pre key={key++} className="overflow-x-auto rounded-xl bg-ink p-4 font-mono text-xs text-ink-foreground">
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const cls = h[1].length === 1 ? "font-display text-lg font-bold" : "font-display text-base font-bold";
      out.push(
        <p key={key++} className={cls}>
          {inline(h[2])}
        </p>,
      );
      i++;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      const List = ordered ? "ol" : "ul";
      out.push(
        <List key={key++} className={cn("space-y-1 pl-5", ordered ? "list-decimal" : "list-disc")}>
          {items.map((it, n) => (
            <li key={n}>{inline(it)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\s*([-*]|\d+\.)\s+|\s*```)/.test(lines[i])) para.push(lines[i++]);
    out.push(<p key={key++}>{inline(para.join(" "))}</p>);
  }
  return out;
}

const TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g;

function inline(text: string): React.ReactNode {
  return text.split(TOKEN).map((part, n) => {
    if (!part) return null;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1)
      return (
        <code key={n} className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={n}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={n}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const href = safeHref(link[2]);
      return href ? (
        <a key={n} href={href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-primary underline underline-offset-2">
          {link[1]}
        </a>
      ) : (
        <Fragment key={n}>{link[1]}</Fragment>
      );
    }
    return <Fragment key={n}>{part}</Fragment>;
  });
}

function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
