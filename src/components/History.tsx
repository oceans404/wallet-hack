import { getNetworkConfig, type NetworkId } from "../lib/network";
import type { HistoryEntry } from "../lib/stellar";
import { formatDate } from "../lib/format";

interface Props {
  network: NetworkId;
  history: HistoryEntry[];
  loading: boolean;
}

const DIRECTION_GLYPH: Record<string, string> = {
  in: "↓",
  out: "↑",
  self: "↺",
};

export function History({ network, history, loading }: Props) {
  const config = getNetworkConfig(network);

  return (
    <section className="card">
      <div className="card-head">
        <h3>Activity</h3>
        {loading && <span className="muted small">Loading…</span>}
      </div>

      {history.length === 0 && !loading ? (
        <p className="muted">No activity on {config.label} yet.</p>
      ) : (
        <div className="history-list">
          {history.map((entry) => (
            <a
              key={entry.id}
              className="history-row"
              href={config.explorerTxUrl(entry.transactionHash)}
              target="_blank"
              rel="noreferrer"
            >
              <span className={`history-glyph dir-${entry.direction ?? "none"}`}>
                {entry.direction ? DIRECTION_GLYPH[entry.direction] : "•"}
              </span>
              <span className="history-body">
                <span className="history-summary">
                  {entry.summary}
                  {!entry.successful && (
                    <span className="tag failed">failed</span>
                  )}
                </span>
                <span className="muted small">{formatDate(entry.createdAt)}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
