import { useState, type FormEvent } from "react";
import { useWallet } from "../context/WalletContext";
import { errorMessage } from "../lib/format";

/**
 * Gate shown when no vault exists yet, or when one exists but is locked.
 * Nothing else in the app renders until the vault key is in memory.
 */
export function Unlock() {
  const { hasVault, createWallet, unlock, reset } = useWallet();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const creating = !hasVault;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (creating) {
      if (!firstName.trim() || !lastName.trim()) {
        setError("Enter your first and last name.");
        return;
      }
      if (!phone.trim()) {
        setError("Enter your phone number.");
        return;
      }
      if (password.length < 8) {
        setError("Use at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }
    }

    setBusy(true);
    try {
      if (creating) {
        await createWallet(password, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
        });
      } else {
        await unlock(password);
      }
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    const confirmed = window.confirm(
      "This erases the encrypted vault and every key inside it. Any account without a backed-up secret key is gone for good. Continue?"
    );
    if (confirmed) reset();
  };

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={handleSubmit}>
        <div className="gate-brand">
          <span className="gate-logo">✦</span>
          <h1>Stellar Wallet</h1>
        </div>

        <p className="gate-copy">
          {creating
            ? "Tell us who you are, then set a password. It encrypts your details and keys in this browser and is never sent anywhere, so it cannot be recovered."
            : "Enter your password to unlock this wallet."}
        </p>

        {creating && (
          <>
            <div className="row gap">
              <label className="field">
                <span>First name</span>
                <input
                  autoFocus
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Ada"
                />
              </label>
              <label className="field">
                <span>Last name</span>
                <input
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Lovelace"
                />
              </label>
            </div>

            <label className="field">
              <span>Phone number</span>
              <input
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 123 4567"
              />
              <small className="muted">
                Encrypted with the same key as your secret keys and stored only
                in this browser.
              </small>
            </label>
          </>
        )}

        <label className="field">
          <span>Password</span>
          <input
            type="text"
            autoFocus={!creating}
            autoComplete={creating ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        {creating && (
          <label className="field">
            <span>Confirm password</span>
            <input
              type="text"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
            />
          </label>
        )}

        {error && <p className="alert alert-error">{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy
            ? "Working…"
            : creating
              ? "Create wallet"
              : "Unlock"}
        </button>

        {!creating && (
          <button className="btn-link danger" type="button" onClick={handleReset}>
            Forgot password? Erase this wallet
          </button>
        )}
      </form>
    </div>
  );
}
