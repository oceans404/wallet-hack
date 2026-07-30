/**
 * How long every submission is held before anything is built or sent. Purely
 * imposed by the UI: nothing is verified during this window.
 */
export const MANDATORY_DELAY_MS = 5000;

export function mandatoryDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MANDATORY_DELAY_MS));
}
