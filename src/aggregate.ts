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

/** A total row does not prove that the server honored the requested grouping. */
export function warnMissingGroups(
  data: unknown,
  groups: { field: string }[]
): void {
  if (!groups.length || !Array.isArray(data) || !data.length) return;
  if (data.length === 1 && data[0]?.values?.['count(*)'] === 0) return;
  const missing = groups.filter(
    ({ field }) =>
      !data.some((row) => row?.fields && Object.hasOwn(row.fields, field))
  );
  if (missing.length) {
    console.error(
      `Warning: no groups returned for ${missing.map(({ field }) => field).join(', ')}. Fields may be absent or not groupable analysis fields; totals are not grouped results. Probe with -g <field>:2 on known matching data.`
    );
  }
}
