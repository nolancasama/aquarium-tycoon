/** Extend the existing opt-in test API without giving it a way to drive feeding. */
export function publishFeedingTestState(read: () => unknown) {
  if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("e2e")) return;
  const api = (window as unknown as { __at?: Record<string, unknown> }).__at;
  if (!api || Object.hasOwn(api, "lagoonFeeding")) return;
  Object.defineProperty(api, "lagoonFeeding", { value: read, enumerable: true, writable: false });
}
