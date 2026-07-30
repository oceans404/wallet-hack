import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface PendingValue {
  /** True while any registered operation is in flight. */
  pending: boolean;
  /**
   * Registers in-flight work and returns the function that clears it. Calling
   * the returned function more than once is a no-op.
   */
  begin: () => () => void;
}

const PendingContext = createContext<PendingValue | null>(null);

/**
 * Tracks how many operations are in flight across the whole app: balance
 * loads, payment submissions, trustline changes, Friendbot funding.
 *
 * A counter rather than a boolean, so overlapping work composes. A refresh
 * that starts during a submission does not clear the flag when it finishes
 * ahead of the submission.
 */
export function PendingProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  const begin = useCallback(() => {
    setCount((n) => n + 1);
    let settled = false;
    return () => {
      if (settled) return;
      settled = true;
      setCount((n) => Math.max(0, n - 1));
    };
  }, []);

  const value = useMemo<PendingValue>(
    () => ({ pending: count > 0, begin }),
    [count, begin]
  );

  return (
    <PendingContext.Provider value={value}>{children}</PendingContext.Provider>
  );
}

export function usePending(): PendingValue {
  const context = useContext(PendingContext);
  if (!context) {
    throw new Error("usePending must be used inside a PendingProvider.");
  }
  return context;
}
