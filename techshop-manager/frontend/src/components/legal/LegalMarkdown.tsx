import { Fragment } from 'react';

/**
 * Rendu Markdown minimal pour les documents juridiques (src/content/legal/*.md).
 * Le Markdown reste la source unique ; on produit des éléments React (aucun HTML
 * injecté). Syntaxe gérée : titres #/##/###, paragraphes, listes « - »,
 * citations « > », tableaux simples, **gras**, URL nues.
 * Les cases à remplir **[…]** et les mentions [HYPOTHÈSE : …] sont surlignées
 * pour rester impossibles à manquer avant publication.
 */

type Block =
  | { kind: 'h1' | 'h2' | 'h3' | 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] };

export function slugify(text: string): string {
  return text
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const heading = /^(#{1,3}) (.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: (['h1', 'h2', 'h3'] as const)[heading[1].length - 1], text: heading[2].trim() });
      i++; continue;
    }
    if (line.startsWith('> ')) {
      const parts: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) parts.push(lines[i++].slice(2));
      blocks.push({ kind: 'quote', text: parts.join(' ') });
      continue;
    }
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2));
      blocks.push({ kind: 'ul', items });
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const row = cells(lines[i++]);
        if (!row.every(c => /^:?-+:?$/.test(c))) rows.push(row);
      }
      blocks.push({ kind: 'table', head: rows[0] ?? [], rows: rows.slice(1) });
      continue;
    }
    const parts: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3} |> |- |\|)/.test(lines[i])) parts.push(lines[i++].trim());
    blocks.push({ kind: 'p', text: parts.join(' ') });
  }
  return blocks;
}

const INLINE = /(\*\*[^*]+\*\*|\[HYPOTHÈSE : [^\]]+\]|https?:\/\/[^\s)]+)/g;

function Inline({ text }: { text: string }) {
  const parts = text.split(INLINE);
  return (
    <>
      {parts.map((part, k) => {
        if (!part) return null;
        if (part.startsWith('**') && part.endsWith('**')) {
          const inner = part.slice(2, -2);
          return inner.startsWith('[')
            ? <mark key={k} className="lg-todo">{inner}</mark>
            : <strong key={k}>{inner}</strong>;
        }
        if (part.startsWith('[HYPOTHÈSE')) return <span key={k} className="lg-assume">{part}</span>;
        if (/^https?:\/\//.test(part)) {
          const url = part.replace(/[.,;:]+$/, '');
          const rest = part.slice(url.length);
          return (
            <Fragment key={k}>
              <a href={url} target="_blank" rel="noopener noreferrer">{url.replace(/^https?:\/\//, '')}</a>{rest}
            </Fragment>
          );
        }
        return <Fragment key={k}>{part}</Fragment>;
      })}
    </>
  );
}

export function LegalMarkdown({ source }: { source: string }) {
  return (
    <>
      {parseMarkdown(source).map((b, k) => {
        switch (b.kind) {
          case 'h1': return <h1 key={k} className="lg-h1"><Inline text={b.text} /></h1>;
          case 'h2': return <h2 key={k} id={slugify(b.text)} className="lg-h2"><Inline text={b.text} /></h2>;
          case 'h3': return <h3 key={k} className="lg-h3"><Inline text={b.text} /></h3>;
          case 'p': return <p key={k}><Inline text={b.text} /></p>;
          case 'quote': return <aside key={k} className="lg-quote"><Inline text={b.text} /></aside>;
          case 'ul': return <ul key={k}>{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ul>;
          case 'table': return (
            <div key={k} className="lg-table-wrap">
              <table>
                <thead><tr>{b.head.map((h, j) => <th key={j} scope="col"><Inline text={h} /></th>)}</tr></thead>
                <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, m) => <td key={m}><Inline text={c} /></td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
      })}
    </>
  );
}
