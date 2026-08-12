import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked for safe, compact output
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Render markdown as sanitized HTML.
// Supports: # headings, [links](url), **bold**, *italic*, `code`, - lists, > quotes
export function Markdown({ children, className = '' }: { children: string; className?: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(children ?? '', { async: false }) as string;
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'strong', 'em', 'code', 'pre',
        'ul', 'ol', 'li', 'blockquote', 'br', 'hr', 'span', 'del', 'ins', 'sup', 'sub'],
      ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
    });
  }, [children]);

  return (
    <div
      className={`cr-markdown ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
