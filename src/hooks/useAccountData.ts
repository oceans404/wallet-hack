import { useCallback, useEffect, useRef, useState } from "react";
import type { NetworkId } from "../lib/network";
import {
  loadAccountSummary,
  loadHistory,
  type AccountSummary,
  type HistoryEntry,
} from "../lib/stellar";
import { errorMessage } from "../lib/format";

interface AccountData {
  summary: AccountSummary | null;
  history: HistoryEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Loads balances and history for the selected account, reloading whenever the
 * account or network changes. `refresh` is passed to actions that mutate
 * chain state so the view updates after a submitted transaction.
 */
export function useAccountData(
  network: NetworkId,
  publicKey: string | null
): AccountData {
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const loadedKeyRef = useRef<string | null>(null);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!publicKey) {
      loadedKeyRef.current = null;
      setSummary(null);
      setHistory([]);
      setError(null);
      return;
    }

    // Clear stale data when the account or network changes, so one account's
    // balances are never shown under another's name while the new data loads.
    // A manual refresh keeps the current data on screen instead of blanking it.
    const key = `${network}:${publicKey}`;
    if (loadedKeyRef.current !== key) {
      loadedKeyRef.current = key;
      setSummary(null);
      setHistory([]);
    }

    // Guards against a slow response for a previous account overwriting the
    // data for the one now selected.
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      loadAccountSummary(network, publicKey),
      loadHistory(network, publicKey),
    ])
      .then(([nextSummary, nextHistory]) => {
        if (!active) return;
        setSummary(nextSummary);
        setHistory(nextHistory);
      })
      .catch((err) => {
        if (!active) return;
        setError(errorMessage(err));
        setSummary(null);
        setHistory([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [network, publicKey, nonce]);

  return { summary, history, loading, error, refresh };
}
