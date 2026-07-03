// Phase 0 PDF→HTML ingestion.
// Uses pdf-parse for robust Node/Bun text extraction (no worker/native deps).
// Produces semantic HTML with stable block anchors (data-anchor="bN").
// Phase 1 will swap to a position-aware converter (MinerU/Marker) for figures/tables.

// @ts-expect-error - pdf-parse ships no types
import pdfParse from 'pdf-parse';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface IngestResult {
  title: string;
  html: string;
}

export async function pdfToHtml(data: Uint8Array, fallbackTitle: string): Promise<IngestResult> {
  const res = await pdfParse(Buffer.from(data));
  const raw: string = res.text ?? '';
  const metaTitle: string | undefined = res?.info?.Title;

  // Split into paragraphs on blank lines; keep single newlines as line breaks.
  const paragraphs = raw
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\r/g, '').trim())
    .filter((p) => p.length > 0);

  const blocks = paragraphs
    .map((p, i) => {
      const inner = escapeHtml(p).replace(/\n/g, '<br/>');
      return `<p data-anchor="b${i}">${inner}</p>`;
    })
    .join('\n');

  const title = (metaTitle && metaTitle.trim()) || fallbackTitle;
  const html = `<article data-cr-document>\n${blocks}\n</article>`;

  return { title, html };
}
