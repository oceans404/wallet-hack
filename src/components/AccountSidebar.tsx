import { useState } from "react";
import { useWallet } from "../context/WalletContext";
import { errorMessage, shortenAddress } from "../lib/format";
import { hasIdentity } from "../lib/identity";

type AddMode = "generate" | "secret" | "watch";

/**
 * Shown instead of the add-account form when the vault has no identity on it.
 * Only reachable by vaults created before onboarding collected these details;
 * new wallets supply them at creation.
 */
function IdentityGate() {
  const { setIdentity } = useWallet();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const complete =
    Boolean(firstName.trim()) && Boolean(lastName.trim()) && Boolean(phone.trim());

  const handleSave = async () => {
    setError(null);
    setBusy(true);
    try {
      await setIdentity({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="add-panel">
      <h2>Verify your identity</h2>
      <p className="muted small">
        Required before this wallet can hold an account.
      </p>

      <label className="field">
        <span>First name</span>
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Ada"
          autoComplete="given-name"
        />
      </label>

      <label className="field">
        <span>Last name</span>
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Lovelace"
          autoComplete="family-name"
        />
      </label>

      <label className="field">
        <span>Phone number</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 555 123 4567"
          autoComplete="tel"
        />
      </label>

      {error && <p className="alert alert-error">{error}</p>}

      <button
        className="btn btn-primary"
        type="button"
        onClick={handleSave}
        disabled={busy || !complete}
      >
        {busy ? "Saving…" : "Verify"}
      </button>
    </div>
  );
}

/**
 * Account list plus the "add account" panel. The wallet holds any number of
 * accounts: generated, imported from a secret key, or watch-only addresses.
 */
export function AccountSidebar() {
  const {
    accounts,
    selectedAccount,
    selectAccount,
    addGeneratedAccount,
    addImportedSecret,
    addWatchAddress,
    remove,
    identity,
  } = useWallet();

  const identityVerified = hasIdentity(identity);

  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<AddMode>("generate");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const closePanel = () => {
    setAdding(false);
    setName("");
    setValue("");
    setError(null);
  };

  const handleAdd = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === "generate") await addGeneratedAccount(name);
      else if (mode === "secret") await addImportedSecret(value, name);
      else await addWatchAddress(value, name);
      closePanel();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string, label: string) => {
    const confirmed = window.confirm(
      `Remove "${label}" from this wallet? If you have not backed up its secret key, the key is lost.`
    );
    if (confirmed) await remove(id);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <h2>Accounts</h2>
        <span className="pill">{accounts.length}</span>
      </div>

      <div className="account-list">
        {accounts.length === 0 && (
          <p className="muted small">No accounts yet. Add one below.</p>
        )}

        {accounts.map((account) => {
          const active = account.id === selectedAccount?.id;
          return (
            <div
              key={account.id}
              className={`account-row${active ? " active" : ""}`}
            >
              <button
                type="button"
                className="account-main"
                onClick={() => selectAccount(account.id)}
              >
                <span className="account-name">
                  {account.name}
                  {!account.secret && (
                    <span className="tag" title="No secret key stored — cannot sign">
                      watch
                    </span>
                  )}
                </span>
                <span className="account-address">
                  {shortenAddress(account.publicKey, 6, 6)}
                </span>
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Remove account"
                onClick={() => handleRemove(account.id, account.name)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {!identityVerified ? (
        <IdentityGate />
      ) : adding ? (
        <div className="add-panel">
          <div className="tabs small-tabs">
            <button
              type="button"
              className={mode === "generate" ? "active" : ""}
              onClick={() => setMode("generate")}
            >
              New
            </button>
            <button
              type="button"
              className={mode === "secret" ? "active" : ""}
              onClick={() => setMode("secret")}
            >
              Import
            </button>
            <button
              type="button"
              className={mode === "watch" ? "active" : ""}
              onClick={() => setMode("watch")}
            >
              Watch
            </button>
          </div>

          <label className="field">
            <span>Label (optional)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Savings"
            />
          </label>

          {mode === "secret" && (
            <label className="field">
              <span>Secret key</span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="S…"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          )}

          {mode === "watch" && (
            <label className="field">
              <span>Address</span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="G…"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          )}

          {mode === "generate" && (
            <p className="muted small">
              Generates a fresh keypair and stores it encrypted in this browser.
            </p>
          )}

          {error && <p className="alert alert-error">{error}</p>}

          <div className="row gap">
            <button
              className="btn btn-primary"
              type="button"
              onClick={handleAdd}
              disabled={busy}
            >
              {busy ? "Adding…" : "Add"}
            </button>
            <button className="btn" type="button" onClick={closePanel}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-block"
          type="button"
          onClick={() => setAdding(true)}
        >
          + Add account
        </button>
      )}
    </aside>
  );
}
