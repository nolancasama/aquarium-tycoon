import { decodeSaveReport, SAVE_KEY } from "./save";
import { ROOMS } from "../data/rooms";
import { previewActive } from "../flow/preview";

export const BACKUPS_KEY = "at.save.backups.v1";
export const LASTGOOD_KEY = "at.save.lastgood.v1";
export const PREREPAIR_KEY = "at.save.prerepair.v1";
export type BackupReason = "session-start" | "before-new-game" | "before-restore" | "before-import" | "pre-repair";
export interface SaveSummary {
  v: number | null;
  coins: number | null;
  stage: number | null;
  tanks: number;
  fish: number;
  decor: number;
  rooms: { room: string; tanks: { slot: string; type: string; animals: string[]; decor: number }[] }[];
}
export interface SaveBackup { at: string; reason: BackupReason; raw: string; summary: SaveSummary }

const obj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const number = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;

/** Summaries describe the original records, including stored habitats and inventory. */
export function summarizeSave(raw: string): SaveSummary {
  const summary: SaveSummary = { v: null, coins: null, stage: null, tanks: 0, fish: 0, decor: 0, rooms: [] };
  try {
    const data: unknown = JSON.parse(raw);
    if (!obj(data)) return summary;
    summary.v = number(data.v);
    if (!obj(data.model)) return summary;
    const m = data.model;
    const stored = obj(m.stored) ? m.stored : {};
    const inv = obj(m.inv) ? m.inv : {};
    summary.coins = number(m.coins);
    summary.stage = obj(m.progress) ? number(m.progress.stage) : null;
    const tanks = [...list(m.tanks), ...list(stored.tanks)];
    summary.tanks = tanks.length + list(inv.tanks).length;
    summary.fish = list(inv.fish).length + list(stored.fish).length;
    summary.decor = list(inv.decor).length + list(stored.decor).length;
    for (const t of tanks) {
      if (!obj(t)) continue;
      summary.fish += list(t.fish).length;
      summary.decor += list(t.decor).length;
      const slot = typeof t.slot === "string" ? t.slot : "?";
      const room = ROOMS.find((r) => (r.pads as string[]).includes(slot))?.name ?? "Unknown room";
      let entry = summary.rooms.find((r) => r.room === room);
      if (!entry) { entry = { room, tanks: [] }; summary.rooms.push(entry); }
      entry.tanks.push({ slot, type: typeof t.type === "string" ? t.type : "?", animals: list(t.fish).map((f) => obj(f) && typeof f.species === "string" ? f.species : "?"), decor: list(t.decor).length });
    }
  } catch { /* An unreadable original is still a recoverable raw backup. */ }
  return summary;
}

export function readRawSave(): string | null {
  return readSaveStorage().raw;
}
export function readSaveStorage(): { ok: boolean; raw: string | null } {
  try { return { ok: true, raw: localStorage.getItem(SAVE_KEY) }; } catch { return { ok: false, raw: null }; }
}

function readJson(key: string): unknown {
  try { const raw = localStorage.getItem(key); return raw === null ? null : JSON.parse(raw); } catch { return null; }
}
function isBackup(value: unknown): value is SaveBackup {
  return obj(value) && typeof value.at === "string" && typeof value.raw === "string" &&
    typeof value.reason === "string" && ["session-start", "before-new-game", "before-restore", "before-import", "pre-repair"].includes(value.reason);
}
function readCopies(key: string, limit: number): SaveBackup[] {
  return list(readJson(key)).filter(isBackup).slice(-limit).map((b) => ({ ...b, summary: summarizeSave(b.raw) }));
}
export const readBackups = (): SaveBackup[] => readCopies(BACKUPS_KEY, 5);
export const readPreRepair = (): SaveBackup[] => readCopies(PREREPAIR_KEY, 3);
export function readLastGood(): SaveBackup | null {
  const b = readJson(LASTGOOD_KEY);
  return isBackup(b) ? { ...b, summary: summarizeSave(b.raw) } : null;
}

function quota(error: unknown): boolean {
  return obj(error) && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || error.code === 22 || error.code === 1014);
}

/** A quota retry may evict only the oldest rotating copy; never good or pinned copies. */
function persist(key: string, value: unknown, protectedRaw?: string | null): boolean {
  const serialize = (v: unknown) => key === SAVE_KEY ? String(v) : JSON.stringify(v);
  try { localStorage.setItem(key, serialize(value)); return true; }
  catch (error) {
    if (!quota(error)) return false;
    try {
      const existing = readBackups();
      if (protectedRaw !== undefined && existing[0]?.raw === protectedRaw) return false;
      const ring = existing.slice(1);
      if (key === BACKUPS_KEY && Array.isArray(value) && value.length < 2) return false;
      const retry = key === BACKUPS_KEY && Array.isArray(value) ? value.slice(1) : value;
      if (key !== BACKUPS_KEY) localStorage.setItem(BACKUPS_KEY, JSON.stringify(ring));
      localStorage.setItem(key, serialize(retry));
      return true;
    } catch { return false; }
  }
}

export function backupRawSave(raw: string, reason: BackupReason): boolean {
  if (previewActive()) return false;
  const existing = readBackups();
  if (existing.some((b) => b.raw === raw)) return true;
  const b: SaveBackup = { at: new Date().toISOString(), reason, raw, summary: summarizeSave(raw) };
  return persist(BACKUPS_KEY, [...existing, b].slice(-5));
}

export function pinPreRepair(raw: string): boolean {
  if (previewActive()) return false;
  const existing = readPreRepair();
  if (existing.some((b) => b.raw === raw)) return true;
  return persist(PREREPAIR_KEY, [...existing, { at: new Date().toISOString(), reason: "pre-repair", raw, summary: summarizeSave(raw) }].slice(-3));
}

export function updateLastGood(raw: string): boolean {
  if (previewActive()) return false;
  const { data, report } = decodeSaveReport(raw);
  // A repaired save's quarantine must not promote it over the original good copy.
  if (!data || report.rejected.length || report.synthesizedTanks.length || data.model.quarantine?.length) return false;
  return persist(LASTGOOD_KEY, { at: new Date().toISOString(), reason: "session-start", raw, summary: summarizeSave(raw) });
}

/** Unlike ordinary autosave, a deliberate replacement must report storage failure. */
export function replaceRawSave(raw: string): boolean {
  if (previewActive()) return false;
  const current = readSaveStorage();
  if (!current.ok) return false;
  return persist(SAVE_KEY, raw, current.raw);
}
