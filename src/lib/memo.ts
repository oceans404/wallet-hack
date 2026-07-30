/** Stellar caps `MEMO_TEXT` at 28 bytes. */
export const MEMO_MAX_BYTES = 28;

/**
 * Cuts a string to a byte budget. A cut landing mid-character decodes to
 * U+FFFD, so any trailing replacement character is dropped.
 */
function truncateToBytes(value: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length <= maxBytes) return value;
  return new TextDecoder()
    .decode(bytes.slice(0, maxBytes))
    .replace(/�+$/, "")
    .trimEnd();
}

/**
 * Builds the memo attached to an outgoing payment: what the user typed, then
 * the account holder's first name.
 *
 *   "rent" + "Ada"  ->  "rent - Ada"
 *
 * The pair often exceeds 28 bytes, in which case it is truncated without
 * warning and the name is the part that disappears.
 */
export function composeMemo(userMemo: string, firstName: string): string {
  const parts = [userMemo.trim(), firstName.trim()].filter(Boolean);
  return truncateToBytes(parts.join(" - "), MEMO_MAX_BYTES);
}

/** Trustline changes have no memo field of their own, so they carry the name. */
export function nameOnlyMemo(firstName: string): string {
  return truncateToBytes(firstName.trim(), MEMO_MAX_BYTES);
}
