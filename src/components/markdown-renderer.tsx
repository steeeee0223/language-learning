import type { ReactNode } from 'react';

type MarkdownRendererProps = {
  content: string;
};

function renderInline(text: string) {
  return text;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const lines = content.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length === 0) {
      return;
    }

    nodes.push(
      <ul key={`list-${nodes.length}`} className="my-4 list-disc space-y-2 pl-6 text-zinc-700">
        {listItems.map((item, index) => (
          <li key={`${item}-${index}`}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  }

  lines.forEach((line, index) => {
    if (line.startsWith('- ')) {
      listItems.push(line.slice(2));
      return;
    }

    flushList();

    if (line.startsWith('# ')) {
      nodes.push(
        <h1 key={index} className="mb-5 text-3xl font-semibold text-zinc-950">
          {line.slice(2)}
        </h1>,
      );
    } else if (line.startsWith('## ')) {
      nodes.push(
        <h2 key={index} className="mb-3 mt-8 text-xl font-semibold text-zinc-950">
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith('### ')) {
      nodes.push(
        <h3 key={index} className="mb-2 mt-6 text-lg font-semibold text-zinc-900">
          {line.slice(4)}
        </h3>,
      );
    } else if (line.trim() === '') {
      nodes.push(<div key={index} className="h-2" />);
    } else {
      nodes.push(
        <p key={index} className="my-3 leading-7 text-zinc-700">
          {renderInline(line)}
        </p>,
      );
    }
  });

  flushList();

  return <article className="max-w-none">{nodes}</article>;
}
