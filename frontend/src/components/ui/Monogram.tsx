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

function derive(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
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
