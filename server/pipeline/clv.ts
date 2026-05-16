export function computeSpreadOrTotalClv(
  lineAtSignal: number | null,
  closingLine: number | null,
): number | null {
  if (lineAtSignal === null || closingLine === null) return null;

  const rounded = Math.round((lineAtSignal - closingLine) * 10) / 10;
  return Math.min(20, Math.max(-20, rounded));
}
