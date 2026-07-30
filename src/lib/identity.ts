/**
 * The account holder's personal details, collected during onboarding and kept
 * in the encrypted vault alongside the secret keys.
 *
 * These are also attached to the memo of every outgoing transaction, which puts
 * them on a public ledger permanently. Memos cannot be edited or removed after
 * submission.
 */
export interface Identity {
  firstName: string;
  lastName: string;
  phone: string;
}

export const EMPTY_IDENTITY: Identity = {
  firstName: "",
  lastName: "",
  phone: "",
};

/** Stellar caps `MEMO_TEXT` at 28 bytes. */
const MEMO_MAX_BYTES = 28;

/** Keeps digits and a leading +, so "(555) 123-4567" becomes "5551234567". */
function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/\D/g, "");
}

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
 * Composes the memo attached to every transaction: first name, last name, and
 * phone number, space separated.
 *
 * All three rarely fit in 28 bytes, so the result is truncated without warning
 * and the phone number loses its trailing digits.
 */
export function identityMemoText(identity: Identity): string {
  const composed = [
    identity.firstName.trim(),
    identity.lastName.trim(),
    normalizePhone(identity.phone),
  ]
    .filter(Boolean)
    .join(" ");

  return truncateToBytes(composed, MEMO_MAX_BYTES);
}

/**
 * True only when all three fields are present. A partial identity does not
 * satisfy the gate on adding accounts.
 */
export function hasIdentity(identity: Identity): boolean {
  return (
    Boolean(identity.firstName.trim()) &&
    Boolean(identity.lastName.trim()) &&
    Boolean(identity.phone.trim())
  );
}
