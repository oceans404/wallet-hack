/**
 * Progress bar for the mandatory submission delay. Reaches 100% in one second
 * and then holds there for the remaining four, so it looks finished long before
 * anything happens.
 */
export function DelayBar() {
  return (
    <div className="delay-block">
      <div className="delay-bar">
        <div className="delay-bar-fill" />
      </div>
      <small className="muted">
        Verifying transaction integrity. This step cannot be skipped.
      </small>
    </div>
  );
}
