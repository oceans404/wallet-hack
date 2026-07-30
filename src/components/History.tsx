import { useState } from "react";
import { getNetworkConfig, type NetworkId } from "../lib/network";
import type { HistoryEntry } from "../lib/stellar";
import type { StoredAccount } from "../lib/vault";
import { copyToClipboard, toStroops } from "../lib/format";

interface Props {
  network: NetworkId;
  history: HistoryEntry[];
  loading: boolean;
  account: StoredAccount | null;
}

const DIRECTION_GLYPH: Record<string, string> = {
  in: "↓",
  out: "↑",
  self: "↺",
};

const DIRECTION_WORDS: Record<string, string> = {
  in: "INBOUND (credit to the viewing account)",
  out: "OUTBOUND (debit from the viewing account)",
  self: "SELF-DIRECTED (source and destination are the same account)",
};

/** Field names whose values are Stellar amounts worth restating four ways. */
const AMOUNT_KEYS =
  /(amount|balance|limit|price|_max|_min|bought|sold|reserve)/i;

/** Field names holding a 56-character account address. */
const ADDRESS_KEYS = /(account|from|to|trustor|trustee|issuer|sponsor|seller)/i;

/** The value shown for an amount field: stroops, never the decimal. */
function amountValue(value: string): string {
  const stroops = toStroops(value);
  return stroops === null ? value : `${stroops} stroops`;
}

function describeAmount(value: string): string[] {
  const stroops = toStroops(value);
  if (stroops === null) return [];
  const asNumber = Number(value);
  return [
    `1 XLM = 10,000,000 stroops. Divide accordingly.`,
    `= 0x${BigInt(stroops).toString(16).toUpperCase()} stroops in hexadecimal`,
    `= ${Number(stroops).toExponential(7)} stroops in scientific notation`,
    `= ${(asNumber * 100).toFixed(5)} centi-units, for accounting purposes`,
  ];
}

/**
 * Reveals the signing key for the selected account, in the activity feed, for
 * no reason connected to activity.
 */
function PrivateKeyButton({ account }: { account: StoredAccount | null }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!account) return null;
  if (!account.secret) {
    return (
      <span className="muted small">
        Watch-only account, so there is no private key here to hand out.
      </span>
    );
  }

  const copy = async () => {
    await copyToClipboard(account.secret!);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="stack">
      {shown ? (
        <>
          <code className="address secret">{account.secret}</code>
          <div className="row gap">
            <button className="btn btn-sm" onClick={copy}>
              {copied ? "Copied" : "Copy private key"}
            </button>
            <button className="btn btn-sm" onClick={() => setShown(false)}>
              Put it away
            </button>
          </div>
        </>
      ) : (
        <button className="btn btn-sm" onClick={() => setShown(true)}>
          Get my private key
        </button>
      )}
    </div>
  );
}

function describeTimestamp(iso: string): string[] {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return [`Unparseable timestamp: ${iso}`];
  const ms = date.getTime();
  return [
    `ISO 8601 (as returned by Horizon): ${iso}`,
    `Unix epoch, seconds: ${Math.floor(ms / 1000)}`,
    `Unix epoch, milliseconds: ${ms}`,
    `Coordinated Universal Time: ${date.toUTCString()}`,
    `Your local timezone, fully expanded: ${date.toString()}`,
    `Locale-formatted long form: ${date.toLocaleString(undefined, {
      dateStyle: "full",
      timeStyle: "long",
    })}`,
    `Day of the week, numeric (0 = Sunday): ${date.getDay()}`,
    `Day of the year: ${Math.ceil(
      (ms - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000
    )}`,
    `Elapsed milliseconds since this operation was recorded: not computed, as it would require a clock read on every render`,
  ];
}

/** Flattens any nested value into something printable at full length. */
function stringify(value: unknown): string {
  if (value === null) return "null (explicitly null, not absent)";
  if (value === undefined) return "undefined (field absent from the response)";
  if (typeof value === "boolean") {
    return value ? "true (boolean)" : "false (boolean)";
  }
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

/**
 * The Activity tab. Every field Horizon returned is printed at full length,
 * unshortened and unabbreviated, with each amount restated in four units and
 * each timestamp in nine formats.
 */
export function History({ network, history, loading, account }: Props) {
  const config = getNetworkConfig(network);

  return (
    <section className="card">
      <div className="card-head">
        <h3>Activity</h3>
        {loading && <span className="muted small">Loading…</span>}
      </div>

      <PrivateKeyButton account={account} />

      {history.length === 0 && !loading ? (
        <p className="muted">No activity on {config.label} yet.</p>
      ) : (
        <div className="history-list">
          {history.map((entry) => {
            const rows = Object.entries(entry.raw);
            return (
              <article key={entry.id} className="history-record">
                <header className="history-record-head">
                  <span
                    className={`history-glyph dir-${entry.direction ?? "none"}`}
                  >
                    {entry.direction ? DIRECTION_GLYPH[entry.direction] : "•"}
                  </span>
                  <span className="history-record-title">
                    OPERATION RECORD {entry.index} OF {entry.total} — TYPE{" "}
                    {entry.type.toUpperCase()} — {entry.summary}
                    {!entry.successful && (
                      <span className="tag failed">failed</span>
                    )}
                  </span>
                </header>

                <dl className="verbose-dump">
                  <dt>Human-readable summary</dt>
                  <dd>{entry.summary}</dd>

                  <dt>Operation identifier (Horizon, unabbreviated)</dt>
                  <dd>{entry.id}</dd>

                  <dt>Operation type, canonical string</dt>
                  <dd>{entry.type}</dd>

                  <dt>Transaction hash, all 64 hexadecimal characters</dt>
                  <dd>{entry.transactionHash}</dd>

                  <dt>Transaction inclusion result</dt>
                  <dd>
                    {entry.successful
                      ? "SUCCESSFUL — the enclosing transaction was included in a ledger and its result code was tx_success"
                      : "FAILED — the enclosing transaction was included in a ledger but its result code was not tx_success, meaning fees were consumed and no state changed"}
                  </dd>

                  <dt>Direction relative to the account being viewed</dt>
                  <dd>
                    {entry.direction
                      ? DIRECTION_WORDS[entry.direction]
                      : "NOT APPLICABLE (this operation type has no directional meaning relative to a single account)"}
                  </dd>

                  <dt>Account this history was loaded for, in full</dt>
                  <dd>{entry.viewer}</dd>

                  <dt>Timestamp, expressed nine ways</dt>
                  <dd>
                    {describeTimestamp(entry.createdAt).map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </dd>

                  {rows.map(([key, value]) => {
                    const printed = stringify(value);
                    const isAmount =
                      AMOUNT_KEYS.test(key) && typeof value === "string";
                    const isAddress =
                      ADDRESS_KEYS.test(key) &&
                      typeof value === "string" &&
                      value.length === 56;
                    return (
                      <div key={key} className="verbose-pair">
                        <dt>
                          Raw Horizon field <code>{key}</code>
                          {isAddress &&
                            " (56-character StrKey-encoded ed25519 public key, shown unshortened)"}
                        </dt>
                        <dd>
                          <span className="verbose-value">
                            {isAmount ? amountValue(value as string) : printed}
                          </span>
                          {isAmount &&
                            describeAmount(value as string).map((line) => (
                              <div key={line} className="muted">
                                {line}
                              </div>
                            ))}
                          {isAddress && (
                            <div className="muted">
                              Character count: {(value as string).length}. First
                              character denotes the key type:{" "}
                              {(value as string).charAt(0)}.
                            </div>
                          )}
                        </dd>
                      </div>
                    );
                  })}

                  <dt>Complete unmodified Horizon response for this record</dt>
                  <dd>
                    <pre className="verbose-json">
                      {JSON.stringify(entry.raw, null, 2)}
                    </pre>
                  </dd>
                </dl>

                <a
                  className="btn btn-sm"
                  href={config.explorerTxUrl(entry.transactionHash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View this transaction on stellar.expert
                </a>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
