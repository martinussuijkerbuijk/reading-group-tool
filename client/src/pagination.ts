// Split a document's HTML into pages based on character count.
// Each page knows its global character offset range so that
// TextPositionSelector offsets (which are global) can be mapped
// to local offsets within the rendered page.

export interface Page {
  html: string;
  startOffset: number;
  endOffset: number;
  blockCount: number;
}

export function splitIntoPages(html: string, charsPerPage = 2800): Page[] {
  // Parse the HTML to extract block-level elements
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, 'text/html');
  const article = parsed.querySelector('article[data-cr-document]') || parsed.body;
  const blocks = Array.from(article.children);

  if (blocks.length === 0) {
    return [{ html, startOffset: 0, endOffset: 0, blockCount: 1 }];
  }

  const pages: Page[] = [];
  let currentBlocks: Element[] = [];
  let currentChars = 0;
  let globalOffset = 0;

  for (const block of blocks) {
    const textLen = block.textContent?.length ?? 0;
    currentBlocks.push(block);
    currentChars += textLen;

    // Start a new page if we've exceeded the target and have at least 1 block
    if (currentChars >= charsPerPage && currentBlocks.length >= 1) {
      // Join without whitespace to keep textContent offsets exact
      const pageHtml = currentBlocks.map((b) => b.outerHTML).join('');
      pages.push({
        html: pageHtml,
        startOffset: globalOffset,
        endOffset: globalOffset + currentChars,
        blockCount: currentBlocks.length,
      });
      globalOffset += currentChars;
      currentBlocks = [];
      currentChars = 0;
    }
  }

  // Remaining blocks
  if (currentBlocks.length > 0) {
    const pageHtml = currentBlocks.map((b) => b.outerHTML).join('');
    pages.push({
      html: pageHtml,
      startOffset: globalOffset,
      endOffset: globalOffset + currentChars,
      blockCount: currentBlocks.length,
    });
  }

  return pages;
}

// Find which page an annotation falls on, given its global position offset
export function findPageForOffset(pages: Page[], globalOffset: number): number {
  for (let i = 0; i < pages.length; i++) {
    if (globalOffset >= pages[i].startOffset && globalOffset < pages[i].endOffset) {
      return i;
    }
  }
  // If offset is at the very end, return last page
  if (pages.length > 0 && globalOffset >= pages[pages.length - 1].endOffset) {
    return pages.length - 1;
  }
  return -1;
}
