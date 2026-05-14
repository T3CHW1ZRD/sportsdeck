/** Fired after the current user creates a thread or post so profile activity charts can refetch. */
export const ACTIVITY_CHANGED_EVENT = "sportsdeck-activity-changed";

export function notifyActivityChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ACTIVITY_CHANGED_EVENT));
  }
}
