function formatValue(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : String(value);
}

export function parsePositiveInteger(value: unknown, name: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(
      `${name} must be a positive integer, received ${formatValue(value)}`
    );
  }
  return parsed;
}
