import { useEffect, useMemo, useState, type FormEvent } from "react";
import { usePending } from "../context/PendingContext";
import { DelayBar } from "./DelayBar";
import { mandatoryDelay } from "../lib/delay";
import type { NetworkId } from "../lib/network";
import type { AccountSummary } from "../lib/stellar";
import type { StoredAccount } from "../lib/vault";
import { buildPaymentTx, parseAsset, signAndSubmit } from "../lib/tx";
import { errorMessage, formatAmount } from "../lib/format";

interface Props {
  account: StoredAccount;
  network: NetworkId;
  summary: AccountSummary | null;
  onRefresh: () => void;
}

/** Demo default: payments are pre-addressed here. */
const DEFAULT_DESTINATION =
  "GCRIEM2XEYK2IDBFDJNWQX3NEWBWJDKGI57WZNHWOU4HV7VJMZOJ5U5H";

export function SendPayment({ account, network, summary, onRefresh }: Props) {
  const { begin } = usePending();
  const [destination, setDestination] = useState(DEFAULT_DESTINATION);
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [assetKey, setAssetKey] = useState("native");
  const [memo, setMemo] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<{ hash: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [delaying, setDelaying] = useState(false);

  // Pool shares can't be sent as payments, so they're excluded from the picker.
  const sendable = useMemo(
    () => summary?.balances.filter((b) => !b.isPoolShare) ?? [],
    [summary]
  );

  const selected = sendable.find((b) => b.key === assetKey) ?? sendable[0];
  const canSign = Boolean(account.secret);

  // XLM is capped by the reserve; other assets can be sent in full.
  const maxSpendable = selected
    ? selected.key === "native"
      ? summary?.spendableXlm ?? ""
      : selected.balance
    : "";

  // Prefill the maximum until the user edits the amount themselves.
  useEffect(() => {
    if (!amountTouched && maxSpendable) setAmount(maxSpendable);
  }, [amountTouched, maxSpendable]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!account.secret) {
      setError("This is a watch-only account and cannot sign transactions.");
      return;
    }
    if (!selected) {
      setError("This account holds no assets to send.");
      return;
    }
    if (!memo.trim()) {
      setError("A memo is required.");
      return;
    }

    setBusy(true);
    const endPending = begin();
    try {
      setDelaying(true);
      await mandatoryDelay();
      setDelaying(false);

      setStatus("Building transaction…");
      const asset = parseAsset(selected.code, selected.issuer);
      const transaction = await buildPaymentTx({
        network,
        source: account.publicKey,
        destination: destination.trim(),
        amount: amount.trim(),
        asset,
        memo,
        firstName: account.firstName,
      });

      setStatus("Signing and submitting…");
      const submitted = await signAndSubmit(network, transaction, account.secret);

      setResult({ hash: submitted.hash, url: submitted.explorerUrl });
      setStatus(null);
      setDestination(DEFAULT_DESTINATION);
      setAmount("");
      setAmountTouched(false);
      setMemo("");
      onRefresh();
    } catch (err) {
      setError(errorMessage(err));
      setStatus(null);
    } finally {
      setDelaying(false);
      endPending();
      setBusy(false);
    }
  };

  if (!summary?.funded) {
    return (
      <section className="card">
        <h3>Send</h3>
        <p className="muted">Fund this account before sending a payment.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h3>Send a payment</h3>

      <form className="stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>Asset</span>
          <select
            value={selected?.key ?? "native"}
            onChange={(e) => setAssetKey(e.target.value)}
          >
            {sendable.map((balance) => (
              <option key={balance.key} value={balance.key}>
                {balance.code} — {formatAmount(balance.balance)} available
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Destination</span>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="G…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span>Amount</span>
          <input
            value={amount}
            onChange={(e) => {
              setAmountTouched(true);
              setAmount(e.target.value);
            }}
            placeholder="0.0"
            inputMode="decimal"
          />
          {selected?.key === "native" && (
            <small className="muted">
              {formatAmount(summary.spendableXlm)} XLM spendable after the{" "}
              {summary.reserveXlm} XLM reserve
            </small>
          )}
        </label>

        <label className="field">
          <span>Memo</span>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Required"
            maxLength={28}
          />
        </label>

        {delaying && <DelayBar />}
        {status && <p className="alert">{status}</p>}
        {error && <p className="alert alert-error">{error}</p>}
        {result && (
          <p className="alert alert-success">
            Sent.{" "}
            <a href={result.url} target="_blank" rel="noreferrer">
              View {result.hash.slice(0, 8)}… on stellar.expert
            </a>
          </p>
        )}

        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy || !canSign}
        >
          {busy ? "Processing…" : "Send"}
        </button>

        {!canSign && (
          <p className="muted small">
            Watch-only accounts cannot sign. Import the secret key to send.
          </p>
        )}
      </form>
    </section>
  );
}
