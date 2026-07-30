import { useState, type FormEvent } from "react";
import type { NetworkId } from "../lib/network";
import type { AccountSummary } from "../lib/stellar";
import type { StoredAccount } from "../lib/vault";
import { buildTrustlineTx, parseAsset, signAndSubmit } from "../lib/tx";
import { errorMessage, formatAmount, shortenAddress } from "../lib/format";

interface Props {
  account: StoredAccount;
  network: NetworkId;
  summary: AccountSummary | null;
  onRefresh: () => void;
}

/**
 * Trustlines are what let an account hold a non-XLM asset. Each one costs
 * 0.5 XLM of reserve, which is why removal is offered too.
 */
export function Trustlines({ account, network, summary, onRefresh }: Props) {
  const [code, setCode] = useState("");
  const [issuer, setIssuer] = useState("");
  const [limit, setLimit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const existing =
    summary?.balances.filter((b) => b.key !== "native" && !b.isPoolShare) ?? [];

  const runTrustlineChange = async (
    assetCode: string,
    assetIssuer: string,
    newLimit?: string
  ) => {
    if (!account.secret) {
      setError("This is a watch-only account and cannot sign transactions.");
      return;
    }

    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const transaction = await buildTrustlineTx({
        network,
        source: account.publicKey,
        asset: parseAsset(assetCode, assetIssuer),
        limit: newLimit,
        firstName: account.firstName,
      });
      const submitted = await signAndSubmit(network, transaction, account.secret);
      setNotice(
        `${newLimit === "0" ? "Removed" : "Added"} ${assetCode} — ${submitted.hash.slice(0, 8)}…`
      );
      setCode("");
      setIssuer("");
      setLimit("");
      onRefresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      setError("Enter an asset code.");
      return;
    }
    await runTrustlineChange(
      trimmedCode,
      issuer.trim(),
      limit.trim() || undefined
    );
  };

  const handleRemove = async (assetCode: string, assetIssuer: string) => {
    const confirmed = window.confirm(
      `Remove the ${assetCode} trustline? The balance must be zero first. This frees 0.5 XLM of reserve.`
    );
    if (confirmed) await runTrustlineChange(assetCode, assetIssuer, "0");
  };

  if (!summary?.funded) {
    return (
      <section className="card">
        <h3>Trustlines</h3>
        <p className="muted">Fund this account before adding trustlines.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="card">
        <h3>Current trustlines</h3>
        {existing.length === 0 ? (
          <p className="muted">
            None yet. This account can only hold XLM until you add one.
          </p>
        ) : (
          <div className="balance-list">
            {existing.map((balance) => (
              <div key={balance.key} className="balance-row">
                <div className="balance-asset">
                  <span className="balance-code">{balance.code}</span>
                  <span className="muted small mono">
                    {shortenAddress(balance.issuer ?? "", 6, 6)}
                  </span>
                </div>
                <div className="row gap center">
                  <span className="balance-value">
                    {formatAmount(balance.balance)}
                  </span>
                  <button
                    className="btn btn-sm"
                    disabled={busy || !account.secret}
                    onClick={() =>
                      handleRemove(balance.code, balance.issuer ?? "")
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h3>Add a trustline</h3>
        <form className="stack" onSubmit={handleAdd}>
          <label className="field">
            <span>Asset code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="USDC"
              maxLength={12}
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <label className="field">
            <span>Issuer address</span>
            <input
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              placeholder="G…"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <label className="field">
            <span>Limit (optional)</span>
            <input
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="Maximum"
              inputMode="decimal"
            />
            <small className="muted">
              Leave blank for no limit. Costs 0.5 XLM of reserve.
            </small>
          </label>

          {error && <p className="alert alert-error">{error}</p>}
          {notice && <p className="alert alert-success">{notice}</p>}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy || !account.secret}
          >
            {busy ? "Processing…" : "Add trustline"}
          </button>
        </form>
      </section>
    </div>
  );
}
