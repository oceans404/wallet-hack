import { useState } from "react";
import type { AccountSummary } from "../lib/stellar";
import { fundWithFriendbot } from "../lib/stellar";
import type { NetworkId } from "../lib/network";
import { getNetworkConfig } from "../lib/network";
import type { StoredAccount } from "../lib/vault";
import {
  copyToClipboard,
  errorMessage,
  formatAmount,
  formatAmountHex,
} from "../lib/format";

interface Props {
  account: StoredAccount;
  network: NetworkId;
  summary: AccountSummary | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

/** Hex stroop count by default; hover to see the decimal amount. */
function HexAmount({ amount }: { amount: string }) {
  return (
    <span className="hex-amount">
      <span className="hex">{formatAmountHex(amount)}</span>
      <span className="dec">{formatAmount(amount)}</span>
    </span>
  );
}

export function Balances({
  account,
  network,
  summary,
  loading,
  error,
  onRefresh,
}: Props) {
  const [copied, setCopied] = useState<"address" | "secret" | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);

  const friendbotAvailable = getNetworkConfig(network).friendbotUrl !== null;

  const copy = async (text: string, which: "address" | "secret") => {
    await copyToClipboard(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleFund = async () => {
    setFundError(null);
    setFunding(true);
    try {
      await fundWithFriendbot(network, account.publicKey);
      onRefresh();
    } catch (err) {
      setFundError(errorMessage(err));
    } finally {
      setFunding(false);
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h3>{account.name}</h3>
          <button className="btn btn-sm" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {account.secret ? (
          <>
            <div className="address-block">
              <code className="address secret">{account.secret}</code>
              <button
                className="btn btn-sm"
                onClick={() => copy(account.secret!, "secret")}
              >
                {copied === "secret" ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="secret-block">
              {revealed ? (
                <>
                  <code className="address">{account.publicKey}</code>
                  <button
                    className="btn btn-sm"
                    onClick={() => copy(account.publicKey, "address")}
                  >
                    {copied === "address" ? "Copied" : "Copy"}
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => setRevealed(false)}
                  >
                    Hide
                  </button>
                </>
              ) : (
                <button className="btn-link" onClick={() => setRevealed(true)}>
                  Reveal public key
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="address-block">
              <code className="address">{account.publicKey}</code>
              <button
                className="btn btn-sm"
                onClick={() => copy(account.publicKey, "address")}
              >
                {copied === "address" ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="muted small">
              Watch-only. Import this address's secret key to send from it.
            </p>
          </>
        )}
      </section>

      {error && <p className="alert alert-error">{error}</p>}

      {summary && !summary.funded && (
        <section className="card">
          <h3>Account not funded</h3>
          <p className="muted">
            This address does not exist on {getNetworkConfig(network).label} yet.
            It becomes active once it receives at least 1 XLM.
          </p>
          {friendbotAvailable ? (
            <button
              className="btn btn-primary"
              onClick={handleFund}
              disabled={funding}
            >
              {funding ? "Funding…" : "Fund with Friendbot"}
            </button>
          ) : (
            <p className="muted small">
              Send at least 1 XLM to this address to activate it.
            </p>
          )}
          {fundError && <p className="alert alert-error">{fundError}</p>}
        </section>
      )}

      {summary?.funded && (
        <section className="card">
          <div className="card-head">
            <h3>Balances</h3>
            <span className="muted small">
              {summary.reserveXlm} XLM reserved · {summary.subentryCount}{" "}
              subentries
            </span>
          </div>

          <div className="balance-list">
            {summary.balances.map((balance) => (
              <div key={balance.key} className="balance-row">
                <div className="balance-asset">
                  <span className="balance-code">{balance.code}</span>
                  {balance.issuer && (
                    <span className="muted small mono">
                      {balance.issuer.slice(0, 4)}…{balance.issuer.slice(-4)}
                    </span>
                  )}
                </div>
                <div className="balance-amounts">
                  <span className="balance-value">
                    <HexAmount amount={balance.balance} />
                  </span>
                  {balance.key === "native" && (
                    <span className="muted small">
                      <HexAmount amount={summary.spendableXlm} /> spendable
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
