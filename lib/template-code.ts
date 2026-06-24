// Derives a unique <=8-char uppercase template code for the ADR-009 system ID
// (CL-{prop}-{CODE}-{date}-{seq}). Custom (manager/admin-authored) templates
// need a code; the 9 placeholders keep their hand-assigned 3-letter codes.

const MAX = 8;
const BASE_MAX = 6; // leave room for a dedup suffix

function baseFrom(title: string): string {
  const words = title
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return "TMPL";
  const initials = words.map((w) => w[0]).join("");
  // Single short word (e.g. "Roofing") yields one initial; use the word itself.
  const base = initials.length >= 2 ? initials : words[0];
  return base.slice(0, BASE_MAX) || "TMPL";
}

export function deriveTemplateCode(
  title: string,
  existing: Iterable<string>,
): string {
  const taken = new Set(Array.from(existing, (c) => c.toUpperCase()));
  const base = baseFrom(title);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = String(n);
    const trimmed = base.slice(0, MAX - suffix.length);
    const candidate = `${trimmed}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
