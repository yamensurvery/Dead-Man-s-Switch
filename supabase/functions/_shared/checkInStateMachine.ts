export type SwitchStatus = "active" | "grace_period" | "triggered" | "paused" | "cancelled";

interface CheckInState {
  status: SwitchStatus;
  lastCheckedInAt: Date | null;
  nextDeadlineAt: Date | null;
  gracePeriodDays: number;
}

interface ComputedState {
  status: SwitchStatus;
  triggeredAt: Date | null;
}

export function computeStatus(state: CheckInState, now: Date = new Date()): ComputedState {
  // Manual states are never touched by the scheduler
  if (state.status === "paused" || state.status === "cancelled") {
    return { status: state.status, triggeredAt: null };
  }

  // No deadline set yet — nothing to evaluate against
  if (!state.nextDeadlineAt) {
    return { status: "active", triggeredAt: null };
  }

  const graceDeadline = new Date(
    state.nextDeadlineAt.getTime() + state.gracePeriodDays * 24 * 60 * 60 * 1000
  );

  if (now < state.nextDeadlineAt) {
    return { status: "active", triggeredAt: null };
  }

  if (now < graceDeadline) {
    return { status: "grace_period", triggeredAt: null };
  }

  return { status: "triggered", triggeredAt: now };
}