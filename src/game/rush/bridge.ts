/**
 * The one call the 3D trophy cabinet makes into the Rush Hour UI: tapping the
 * cabinet opens the RUSH HOUR AWARDS panel. The UI registers the handler.
 */
let handler: (() => void) | null = null;

export function onOpenRushAwards(h: (() => void) | null): void {
  handler = h;
}

export function openRushAwards(): void {
  handler?.();
}
