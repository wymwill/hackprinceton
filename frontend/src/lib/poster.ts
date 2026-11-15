/** Text layout for the Wrapped share card (frontend/src/pages/Wrapped.tsx). */

/**
 * The House quote for the poster as at most 4 lines of up to 40 characters, wrapped
 * in curly quotes. If it doesn't fit, it stops at the last whole word that does and
 * ends with "…" (never skipping a word in the middle).
 */
export function posterLines(quote: string, maxLines = 4, width = 40) {
  const words = quote.replace(/[\p{Cc}\p{Cf}]/gu, "").trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cut = false;
  for (const word of words) {
    const last = lines.length - 1;
    if (last >= 0 && `${lines[last]} ${word}`.length <= width) lines[last] += ` ${word}`;
    else if (lines.length < maxLines) lines.push(word.length > width ? `${word.slice(0, width - 1)}…` : word);
    else {
      cut = true;
      break;
    }
  }
  if (!lines.length) return [];
  if (cut) {
    const last = lines.length - 1;
    lines[last] = (lines[last].length + 1 <= width ? lines[last] : lines[last].replace(/\s+\S+$/, "")) + "…";
  }
  lines[0] = `“${lines[0]}`;
  lines[lines.length - 1] += "”";
  return lines;
}
