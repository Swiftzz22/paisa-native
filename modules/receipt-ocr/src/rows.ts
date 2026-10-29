/**
 * Put a receipt back together line by line.
 *
 * Vision reads a receipt as separate blocks of text, and on a receipt the
 * name of a thing and its price are far apart: "TOTAL" sits on the left,
 * "S$14.93" on the right, and they come back as two blocks with no order
 * promised between them. Here blocks whose vertical spans overlap become one
 * printed row, read left to right, rows top to bottom. The parser then sees
 * "TOTAL S$14.93" the way the paper prints it.
 *
 * Pure, so it can be tested without a phone.
 */

export type TextBlock = {
  text: string;
  /** 0–1 across the image, from the left. */
  x: number;
  /** 0–1 up the image, from the bottom (Vision's convention). */
  y: number;
  width: number;
  height: number;
  confidence?: number;
};

/** How much of the shorter block's height two blocks must share to be one row. */
const SAME_ROW = 0.5;

export function blocksToLines(blocks: TextBlock[]): string[] {
  const usable = blocks.filter((b) => b.text.trim() && b.height > 0);
  // Highest first: Vision's y grows upwards, a receipt is read downwards.
  const sorted = [...usable].sort((a, b) => b.y + b.height - (a.y + a.height));

  const rows: { top: number; bottom: number; blocks: TextBlock[] }[] = [];
  for (const block of sorted) {
    const top = block.y + block.height;
    const bottom = block.y;
    // The row this block shares the most height with, if it shares enough.
    let best: (typeof rows)[number] | null = null;
    let bestShare = 0;
    for (const row of rows) {
      const overlap = Math.min(top, row.top) - Math.max(bottom, row.bottom);
      const share = overlap / Math.min(block.height, row.top - row.bottom);
      if (share > bestShare) {
        best = row;
        bestShare = share;
      }
    }
    if (best && bestShare >= SAME_ROW) {
      best.blocks.push(block);
      // Grow the row only part way, so a slightly tilted receipt doesn't
      // slowly swallow the row below it.
      best.top = Math.max(best.top, top - block.height * 0.25);
      best.bottom = Math.min(best.bottom, bottom + block.height * 0.25);
    } else {
      rows.push({ top, bottom, blocks: [block] });
    }
  }

  return rows
    .sort((a, b) => b.top - a.top)
    .map((row) =>
      row.blocks
        .sort((a, b) => a.x - b.x)
        .map((b) => b.text.trim())
        .join(" ")
    );
}
