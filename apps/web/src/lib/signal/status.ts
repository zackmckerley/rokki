/**
 * Pure presentation model for a linked Signal account's status. DOM-free and
 * side-effect-free so it's unit-testable and safe to import from a client
 * component. Mirrors the `status` CHECK on `signal_accounts`
 * (linking | active | error | unlinked).
 */

export type SignalStatus = "unlinked" | "linking" | "active" | "error";

export type SignalTone = "positive" | "muted" | "warning" | "danger";

export interface SignalStatusView {
  label: string;
  tone: SignalTone;
  /** True only when the account is linked and receiving. */
  connected: boolean;
}

export function describeSignalStatus(
  status: string | null | undefined,
): SignalStatusView {
  switch (status) {
    case "active":
      return { label: "Connected", tone: "positive", connected: true };
    case "linking":
      return { label: "Waiting for scan", tone: "warning", connected: false };
    case "error":
      return { label: "Connection error", tone: "danger", connected: false };
    case "unlinked":
    default:
      return { label: "Not connected", tone: "muted", connected: false };
  }
}

/** Tailwind text-color token for a tone — keeps the dot/label colors in one
 *  place so the component stays declarative. */
export function toneTextClass(tone: SignalTone): string {
  switch (tone) {
    case "positive":
      return "text-success";
    case "warning":
      return "text-warning";
    case "danger":
      return "text-danger";
    case "muted":
    default:
      return "text-text-3";
  }
}
