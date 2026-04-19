interface MonogramProps {
  name: string;
  seed?: string;
  size?: number;
}

function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function firstLetter(word: string): string | undefined {
  const m = word.match(/\p{L}/u);
  return m ? m[0] : undefined;
}

function derive(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const words = trimmed.split(/\s+/);
  if (words.length >= 2) {
    const a = firstLetter(words[0]);
    const b = firstLetter(words[1]);
    if (a && b) return (a + b).toUpperCase();
  }
  const letters = trimmed.match(/\p{L}/gu) ?? [];
  if (letters.length >= 2) return (letters[0] + letters[1]).toUpperCase();
  if (letters.length === 1) return letters[0].toUpperCase();
  return "?";
}

/**
 * Colored 2-letter monogram tile used as a visual stand-in for service logos.
 * Deterministic color per seed (service id or name).
 */
export function Monogram({ name, seed, size = 26 }: MonogramProps) {
  const hue = hueFromString(seed ?? name);
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 rounded-md font-semibold select-none"
      style={{
        width: size,
        height: size,
        fontSize: size <= 24 ? 10.5 : 11.5,
        letterSpacing: "-0.01em",
        background: `oklch(0.9 0.05 ${hue})`,
        color: `oklch(0.32 0.1 ${hue})`,
      }}
    >
      {derive(name)}
    </span>
  );
}
