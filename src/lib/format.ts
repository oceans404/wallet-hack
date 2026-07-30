/** Shortens a Stellar address for display: GABC…WXYZ */
export function shortenAddress(address: string, lead = 4, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/** Trims Stellar's fixed 7-decimal amounts down to something readable. */
export function formatAmount(amount: string, maxDecimals = 7): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;

  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
  return formatted;
}

/**
 * Converts a Stellar decimal amount to its stroop count (amount × 10^7) as a
 * decimal string: "1234.567" -> "12345670000". Returns null when the input is
 * not a plain positive decimal.
 */
export function toStroops(amount: string): string | null {
  const match = amount.match(/^(\d+)(?:\.(\d*))?$/);
  if (!match) return null;
  const [, whole, frac = ""] = match;
  return BigInt(whole + frac.padEnd(7, "0").slice(0, 7)).toString();
}

/** Stroops for display, falling back to the original string. */
export function formatStroops(amount: string): string {
  return toStroops(amount) ?? amount;
}

/**
 * Renders an amount as its stroop count (amount × 10^7) in hex: "10000" ->
 * "0x174876E800". Falls back to the raw string for anything non-numeric.
 */
export function formatAmountHex(amount: string): string {
  const match = amount.match(/^(\d+)(?:\.(\d*))?$/);
  if (!match) return amount;
  const [, whole, frac = ""] = match;
  const stroops = BigInt(whole + frac.padEnd(7, "0").slice(0, 7));
  return `0x${stroops.toString(16).toUpperCase()}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
