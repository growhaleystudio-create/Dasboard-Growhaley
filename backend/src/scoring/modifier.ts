export function confidenceModifier(score: number): number {
  if (score >= 80) return 1.0;
  if (score >= 60) return 0.95;
  if (score >= 40) return 0.85;
  return 0.7;
}
