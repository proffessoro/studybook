import type { ReactNode } from 'react';

/**
 * Renders checked lesson text (`RichText` in packages/shared) on the server, with
 * no editor code. The API already refused anything but these nodes, and this
 * renders only what it knows, so stored text can never run in the browser.
 */
type Mark = { type: string; attrs?: { href?: string } };
type Node = { type: string; text?: string; marks?: Mark[]; attrs?: Record<string, unknown>; content?: Node[] };

function marked(text: string, marks: Mark[] = []): ReactNode {
  return marks.reduce<ReactNode>((inner, mark) => {
    if (mark.type === 'bold') return <strong>{inner}</strong>;
    if (mark.type === 'italic') return <em>{inner}</em>;
    if (mark.type === 'link' && mark.attrs?.href) {
      return (
        <a href={mark.attrs.href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
          {inner}
        </a>
      );
    }
    return inner;
  }, text);
}

function render(nodes: Node[] = []): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return <span key={i}>{marked(node.text ?? '', node.marks)}</span>;
      case 'hardBreak':
        return <br key={i} />;
      case 'paragraph':
        return <p key={i}>{render(node.content)}</p>;
      case 'heading':
        return node.attrs?.level === 3 ? (
          <h3 key={i} className="mt-4 text-lg font-semibold">
            {render(node.content)}
          </h3>
        ) : (
          <h2 key={i} className="mt-6 text-xl font-semibold">
            {render(node.content)}
          </h2>
        );
      case 'bulletList':
        return (
          <ul key={i} className="list-disc pl-6">
            {render(node.content)}
          </ul>
        );
      case 'orderedList':
        return (
          <ol key={i} className="list-decimal pl-6">
            {render(node.content)}
          </ol>
        );
      case 'listItem':
        return <li key={i}>{render(node.content)}</li>;
      case 'image':
        return (
          // Lesson images are protected files, served by the API to members only.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={String(node.attrs?.src ?? '')}
            alt={String(node.attrs?.alt ?? '')}
            loading="lazy"
            decoding="async"
            className="my-2 h-auto max-w-full rounded-md"
          />
        );
      default:
        return null;
    }
  });
}

export function RichTextView({ doc }: { doc: Record<string, unknown> }) {
  return <div className="flex flex-col gap-3 leading-relaxed break-words">{render((doc as Node).content)}</div>;
}
