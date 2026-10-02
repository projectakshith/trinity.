/*
 * Agent output is untrusted: render markdown, then sanitize before it touches the DOM.
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

/* DOMPurify needs a window, so hooks are attached on first use in the browser (not at prerender). */
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
