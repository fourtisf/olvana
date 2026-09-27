/**
 * Utilization / liquidity alert decisions (HANDOFF §7.2), pure so the worker
 * and tests share one implementation.
 *
 *  - "high": utilization ≥ user threshold. Max one per vault per user per 6 h,
 *    re-sent every 6 h while it stays high.
 *  - "recovered": after utilization was ≥ threshold, it falls below
 *    threshold − hysteresis → exits are open again ("liquidity back"). Sent
 *    once per episode.
 */

export const UTIL_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const UTIL_RECOVERY_HYSTERESIS = 2;

/** Per-user, per-vault state, stored in `AlertSettings.lastUtilAlert[vaultId]`. */
export interface UtilAlertState {
  /** When the last high-utilization episode opened / was re-announced (ISO string). */
  lastHighAt: string | null;
  /** True between a "high" alert and the matching "recovered" alert. */
  open: boolean;
}

export const EMPTY_UTIL_ALERT_STATE: UtilAlertState = { lastHighAt: null, open: false };

export interface UtilAlertDecision {
  send: 'high' | 'recovered' | null;
  state: UtilAlertState;
}

export function decideUtilAlert(args: {
  utilization: number;
  threshold: number;
  state: UtilAlertState;
  now: Date;
  /** User toggles. */
  utilizationEnabled: boolean;
  liquidityEnabled: boolean;
}): UtilAlertDecision {
  const { utilization, threshold, state, now } = args;
  if (utilization >= threshold) {
    const last = state.lastHighAt ? Date.parse(state.lastHighAt) : null;
    const cooled = last == null || now.getTime() - last >= UTIL_ALERT_COOLDOWN_MS;
    // Inside the cooldown a new episode isn't opened (so flapping can't spam
    // "high"/"recovered" pairs) and an open one isn't re-announced.
    if (!cooled) return { send: null, state };
    return {
      send: args.utilizationEnabled ? 'high' : null,
      state: { lastHighAt: now.toISOString(), open: true },
    };
  }
  if (state.open && utilization < threshold - UTIL_RECOVERY_HYSTERESIS) {
    return { send: args.liquidityEnabled ? 'recovered' : null, state: { ...state, open: false } };
  }
  return { send: null, state };
}
