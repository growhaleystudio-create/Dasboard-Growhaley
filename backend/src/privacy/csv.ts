/**
 * Minimal, dependency-free CSV serializer for the Privacy_Service export
 * (R11.5).
 *
 * Design references:
 * - design.md → Privacy_Service / Privacy → "Otorisasi ekspor": the export
 *   artifact is a CSV of the Team's canonical Leads.
 * - design.md → Error Handling → Ekspor: the artifact is produced
 *   deterministically from in-memory rows; no I/O or escaping ambiguity.
 *
 * The serializer follows the common RFC-4180 conventions used by
 * spreadsheets:
 * - Fields are joined with a comma and rows with a CRLF (`\r\n`).
 * - A field is wrapped in double quotes when it contains a comma, a double
 *   quote, a carriage return, or a line feed.
 * - Embedded double quotes are escaped by doubling them (`"` → `""`).
 *
 * It is intentionally pure: same input always yields the same output and it
 * performs no validation of the header/row arity beyond what the caller
 * supplies. Callers are responsible for passing matching column counts.
 */

/** Characters that force a field to be quoted. */
const MUST_QUOTE = /[",\r\n]/;

/**
 * Escape a single CSV field. Returns the field unchanged when it contains no
 * special characters, otherwise wraps it in double quotes and doubles any
 * internal quotes.
 */
export function escapeCsvField(field: string): string {
  if (!MUST_QUOTE.test(field)) return field;
  return `"${field.replace(/"/g, '""')}"`;
}

/**
 * Serialize a header row plus data rows to a CSV string.
 *
 * Every field — header and cell alike — is escaped via
 * {@link escapeCsvField}. Rows are terminated with CRLF, including the line
 * after the final row, so the output is a well-formed CSV document.
 */
export function toCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeCsvField).join(','));
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','));
  }
  // Trailing CRLF after every record (including the last) yields a
  // canonical CSV document that spreadsheet importers accept cleanly.
  return lines.map((line) => `${line}\r\n`).join('');
}
