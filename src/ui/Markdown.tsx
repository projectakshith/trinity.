import { memo, useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

let hooked = false;

export function renderMarkdown(source: string): string {
  if (!hooked) {
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
    hooked = true;
  }
  return DOMPurify.sanitize(marked.parse(source, { async: false }) as string);
}

export const Markdown = memo(function Markdown({ source, className }: { source: string; className?: string }) {
  const html = useMemo(() => ({ __html: renderMarkdown(source) }), [source]);
  return <div className={className} dangerouslySetInnerHTML={html} />;
});
