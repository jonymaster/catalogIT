/** Y-axis modes for dashboard spend charts (see BarChart / SpendTrendChart). */
export type ChartYScaleMode = "linearZero" | "linearFocused" | "log";

const FOCUS_PAD = 0.12;
const LOG_EPS = 1;

export interface ChartAxisModel {
  mode: ChartYScaleMode;
  /** Map dollar amount to bar height fraction (0 = baseline, 1 = top of axis). */
  valueToHeightFraction: (value: number) => number;
  /** Value shown at tick position f, where f=0 is chart bottom and f=1 is top. */
  tickValue: (f: number) => number;
  /** Short hint when axis does not start at $0 (focused mode). */
  axisHint: string | null;
}

/**
 * Builds axis mapping for bar/line charts. `linearZero` matches legacy 0…max behavior.
 */
export function buildChartAxis(
  values: number[],
  mode: ChartYScaleMode,
): ChartAxisModel {
  if (values.length === 0) {
    return {
      mode,
      valueToHeightFraction: () => 0,
      tickValue: (f) => f,
      axisHint: null,
    };
  }

  const minV = Math.min(...values);
  const maxV = Math.max(...values);

  if (mode === "linearZero") {
    const yMax = Math.max(maxV, 1);
    return {
      mode,
      valueToHeightFraction: (value) =>
        Math.min(1, Math.max(0, Math.max(0, value) / yMax)),
      tickValue: (f) => f * yMax,
      axisHint: null,
    };
  }

  if (mode === "linearFocused") {
    if (minV <= 0 && maxV > 0) {
      const yMax = Math.max(maxV, 1);
      return {
        mode,
        valueToHeightFraction: (value) =>
          Math.min(1, Math.max(0, Math.max(0, value) / yMax)),
        tickValue: (f) => f * yMax,
        axisHint: null,
      };
    }
    if (maxV <= 0) {
      return {
        mode,
        valueToHeightFraction: () => 0,
        tickValue: (f) => f,
        axisHint: null,
      };
    }

    const range = maxV - minV;
    let yMin: number;
    let yMax: number;
    if (range === 0) {
      yMin = Math.max(0, minV * 0.97);
      yMax = minV * 1.03;
    } else {
      yMin = Math.max(0, minV - FOCUS_PAD * range);
      yMax = maxV + FOCUS_PAD * range;
    }
    const span = yMax - yMin || 1;
    const hintBottom = yMin;
    const hintTop = yMax;
    return {
      mode,
      valueToHeightFraction: (value) => {
        const v = Math.max(0, value);
        return Math.min(1, Math.max(0, (v - yMin) / span));
      },
      tickValue: (f) => yMin + f * span,
      axisHint:
        yMin > 0
          ? `Scale ${formatAxisHintMoney(hintBottom)}–${formatAxisHintMoney(hintTop)}`
          : null,
    };
  }

  // log
  const safe = (v: number) => Math.max(v, LOG_EPS);
  const logLo = Math.log10(safe(minV));
  const logHi = Math.log10(safe(maxV));
  let lo = logLo;
  let hi = logHi;
  if (hi <= lo) {
    hi = lo + 0.02;
  }
  const span = hi - lo;
  return {
    mode,
    valueToHeightFraction: (value) => {
      const lg = Math.log10(safe(value));
      return Math.min(1, Math.max(0, (lg - lo) / span));
    },
    tickValue: (f) => 10 ** (lo + f * span),
    axisHint: "Log scale",
  };
}

/** Compact $ labels for chart Y-axis ticks (bars and trend). */
export function formatChartTickMoney(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "$0";
  return n >= 1000
    ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
    : `$${Math.round(n)}`;
}

function formatAxisHintMoney(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
}
