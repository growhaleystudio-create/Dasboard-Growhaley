export function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function roundScore(n: number): number {
  return clamp(Math.round(n), 0, 100);
}

export function normalizeLogCount(value: number, max = 500): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const safeValue = Math.max(0, value);
  const numerator = Math.log(safeValue + 1);
  const denominator = Math.log(max + 1);
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;
  return clamp((numerator / denominator) * 100, 0, 100);
}

export function normalizedRatio(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return clamp((part / whole) * 100, 0, 100);
}

export function lowerTrim(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}
