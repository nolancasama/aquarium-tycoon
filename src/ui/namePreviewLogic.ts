/** Display names retain spaces, without reading multiword names as title case. */
export function previewName(name: string): string {
  const lower = name.trim().toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function previewText(name: string): string {
  return `${previewName(name)}!`;
}

export function canSpeakPreview(state: { available: boolean; muted: boolean; listening: boolean; speaking: boolean }): boolean {
  return state.available && !state.muted && !state.listening && !state.speaking;
}
