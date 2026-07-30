import { useState } from "react";
import { hasRpc, type NetworkId } from "../lib/network";
import type { StoredAccount } from "../lib/vault";
import {
  invokeCall,
  loadContractMethods,
  simulateCall,
  stringifyResult,
  type ContractMethod,
} from "../lib/soroban";
import { errorMessage } from "../lib/format";

interface Props {
  account: StoredAccount;
  network: NetworkId;
}

interface CallOutput {
  text: string;
  simulated: boolean;
  explorerUrl?: string;
}

/**
 * Loads a Soroban contract's interface from the network and lets the user
 * simulate or invoke any of its methods. The spec lives on-chain, so no ABI
 * file or code generation is involved.
 */
export function ContractLab({ account, network }: Props) {
  const [contractId, setContractId] = useState("");
  const [methods, setMethods] = useState<ContractMethod[] | null>(null);
  const [selected, setSelected] = useState<ContractMethod | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [output, setOutput] = useState<CallOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rpcAvailable = hasRpc(network);

  const handleLoad = async () => {
    setError(null);
    setOutput(null);
    setMethods(null);
    setSelected(null);
    setBusy(true);
    try {
      const loaded = await loadContractMethods(network, contractId.trim());
      setMethods(loaded);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const pickMethod = (method: ContractMethod) => {
    setSelected(method);
    setValues({});
    setOutput(null);
    setError(null);
  };

  const handleSimulate = async () => {
    if (!selected) return;
    setError(null);
    setOutput(null);
    setBusy(true);
    try {
      const { value, isReadCall } = await simulateCall(
        network,
        contractId.trim(),
        selected,
        values
      );
      setOutput({ text: stringifyResult(value), simulated: !isReadCall });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleInvoke = async () => {
    if (!selected) return;
    if (!account.secret) {
      setError("This is a watch-only account and cannot sign transactions.");
      return;
    }

    setError(null);
    setOutput(null);
    setBusy(true);
    try {
      const result = await invokeCall(
        network,
        contractId.trim(),
        selected,
        values,
        account.publicKey,
        account.secret
      );
      setOutput({
        text: stringifyResult(result.value),
        simulated: false,
        explorerUrl: result.explorerUrl || undefined,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!rpcAvailable) {
    return (
      <section className="card">
        <h3>Smart contracts</h3>
        <p className="muted">
          Mainnet has no public Soroban RPC endpoint. Set{" "}
          <code>VITE_STELLAR_MAINNET_RPC_URL</code> to a provider endpoint to
          enable contract calls here, or switch to testnet.
        </p>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="card">
        <h3>Smart contracts</h3>
        <p className="muted small">
          Load any contract by ID. Its callable methods are read straight from
          the network.
        </p>

        <div className="row gap">
          <input
            className="grow"
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            placeholder="C…"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            className="btn btn-primary"
            onClick={handleLoad}
            disabled={busy || !contractId.trim()}
          >
            {busy && !methods ? "Loading…" : "Load"}
          </button>
        </div>

        {error && !methods && <p className="alert alert-error">{error}</p>}
      </section>

      {methods && (
        <section className="card">
          <div className="card-head">
            <h3>Methods</h3>
            <span className="pill">{methods.length}</span>
          </div>

          <div className="method-list">
            {methods.map((method) => (
              <button
                key={method.name}
                type="button"
                className={`method-chip${selected?.name === method.name ? " active" : ""}`}
                onClick={() => pickMethod(method)}
              >
                {method.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {selected && (
        <section className="card">
          <h3>
            <code>{selected.name}</code>
          </h3>
          {selected.doc && <p className="muted small doc">{selected.doc}</p>}

          <div className="stack">
            {selected.inputs.length === 0 && (
              <p className="muted small">This method takes no arguments.</p>
            )}

            {selected.inputs.map((input) => (
              <label key={input.name} className="field">
                <span>
                  {input.name} <span className="muted">({input.type})</span>
                </span>
                <input
                  value={values[input.name] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({
                      ...prev,
                      [input.name]: e.target.value,
                    }))
                  }
                  placeholder={placeholderFor(input.type)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            ))}

            <div className="row gap">
              <button className="btn" onClick={handleSimulate} disabled={busy}>
                {busy ? "Working…" : "Simulate"}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleInvoke}
                disabled={busy || !account.secret}
              >
                Sign & invoke
              </button>
            </div>

            <p className="muted small">
              Simulate is free and changes nothing. Sign &amp; invoke submits a
              real transaction from {account.name}.
            </p>

            {error && <p className="alert alert-error">{error}</p>}

            {output && (
              <div className="output">
                <div className="output-head">
                  <span>Result</span>
                  {output.simulated && (
                    <span className="tag">preview — not submitted</span>
                  )}
                  {output.explorerUrl && (
                    <a href={output.explorerUrl} target="_blank" rel="noreferrer">
                      View transaction
                    </a>
                  )}
                </div>
                <pre>{output.text}</pre>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function placeholderFor(type: string): string {
  const normalized = type.toLowerCase();
  if (normalized === "address") return "G… or C…";
  if (normalized === "bool") return "true or false";
  if (/^[iu]\d+$/.test(normalized)) return "0";
  if (normalized.startsWith("bytes")) return "hex";
  if (normalized === "symbol" || normalized === "string") return "text";
  return "JSON value";
}
