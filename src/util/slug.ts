/** Normalize an arbitrary string to a docker-safe lowercase slug, capped at 32 chars. */
export function slug(input: string, maxLen = 32): string {
  // Collapse dash runs to a single dash *before* trimming so the trim regexes
  // never need to backtrack over a run (avoids polynomial-regex DoS).
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (cleaned.length === 0) return '';
  return cleaned.slice(0, maxLen).replace(/-$/, '');
}

export function slugOrFallback(input: string, fallback: string, maxLen = 32): string {
  const s = slug(input, maxLen);
  return s.length > 0 ? s : fallback;
}
