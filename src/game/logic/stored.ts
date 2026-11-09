import type { DecorKind, SlotId, SpeciesId, TankType } from "../types";
import { RELEASE_OF, ROOM_OF, ROOMS } from "../data/rooms";
import { PAD_TYPES, SLOT_ORDER, TANKS } from "../data/tanks";
import { SPECIES } from "../data/fish";
import { decorFits } from "../data/decor";
import { areaAvailable, type ReleaseArea } from "../data/release";
import { NEXT_DELAY, prepSeconds } from "../rush/config";
import { newRushState } from "../rush/types";
import type { DecorRec, FishRec, Model, StoredArea, TankRec } from "./model";

/**
 * A release-locked area's owned things (its habitat tanks, bagged animals that
 * can only live there, and unplaced items that only fit there) are kept out of
 * play: no rule may count, decay or schedule what the player cannot reach.
 * They wait in `model.stored`, are saved back unchanged, and return to play when
 * the area is released (or for a development preview, which is never saved).
 */

const slotArea = (s: SlotId): ReleaseArea | null => RELEASE_OF[ROOMS[ROOM_OF[s]]?.id] ?? null;

/** The one release area all these belong to, or null (none, or several). */
function only(areas: (ReleaseArea | null)[]): ReleaseArea | null {
  const first = areas[0] ?? null;
  return first && areas.every((a) => a === first) ? first : null;
}

export const tankTypeArea = (t: TankType): ReleaseArea | null => only(SLOT_ORDER.filter((s) => PAD_TYPES[s].includes(t)).map(slotArea));
export const speciesArea = (sp: SpeciesId): ReleaseArea | null => only(SPECIES[sp].habitat.map(tankTypeArea));
export const decorArea = (k: DecorKind): ReleaseArea | null => only((Object.keys(TANKS) as TankType[]).filter((t) => decorFits(k, t)).map(tankTypeArea));

const locked = (a: ReleaseArea | null) => a !== null && !areaAvailable(a);
const free = (a: ReleaseArea | null) => a === null || areaAvailable(a);

/** Move everything of an unavailable area into `stored` (no change, same object, when there is none). */
export function storeLocked(m: Model): Model {
  const tanks = m.tanks.filter((t) => locked(slotArea(t.slot)));
  const fish = m.inv.fish.filter((f) => locked(speciesArea(f.species)));
  const decor = m.inv.decor.filter((d) => locked(decorArea(d.kind)));
  if (!tanks.length && !fish.length && !decor.length) return m;
  const prev = m.stored ?? { tanks: [], fish: [], decor: [] };
  const stored: StoredArea = { tanks: [...prev.tanks, ...tanks], fish: [...prev.fish, ...fish], decor: [...prev.decor, ...decor] };
  const out: Model = {
    ...m,
    tanks: m.tanks.filter((t) => !tanks.includes(t)),
    inv: { ...m.inv, fish: m.inv.fish.filter((f) => !fish.includes(f)), decor: m.inv.decor.filter((d) => !decor.includes(d)) },
    stored
  };
  return pruneRush(out);
}

/** Bring back whatever belongs to an area that is now available (a preview, or a release). */
export function unstoreAvailable(m: Model): Model {
  const s = m.stored;
  if (!s) return m;
  const tanks = s.tanks.filter((t) => free(slotArea(t.slot)) && !m.tanks.some((x) => x.slot === t.slot));
  const fish = s.fish.filter((f) => free(speciesArea(f.species)));
  const decor = s.decor.filter((d) => free(decorArea(d.kind)));
  if (!tanks.length && !fish.length && !decor.length) return m;
  const left: StoredArea = { tanks: s.tanks.filter((t) => !tanks.includes(t)), fish: s.fish.filter((f) => !fish.includes(f)), decor: s.decor.filter((d) => !decor.includes(d)) };
  const { stored: _drop, ...rest } = m;
  void _drop;
  return {
    ...rest,
    tanks: [...m.tanks, ...tanks],
    inv: { ...m.inv, fish: [...m.inv.fish, ...fish], decor: [...m.inv.decor, ...decor] },
    ...(left.tanks.length || left.fish.length || left.decor.length ? { stored: left } : {})
  };
}

/** Every stored record, for save reading (they are validated like the rest). */
export const storedTanks = (s: StoredArea | undefined): TankRec[] => s?.tanks ?? [];
export const storedFish = (s: StoredArea | undefined): FishRec[] => s?.fish ?? [];
export const storedDecor = (s: StoredArea | undefined): DecorRec[] => s?.decor ?? [];

/** A Rush Hour preparation saved with a now-stored habitat keeps only the tanks still in play. */
function pruneRush(m: Model): Model {
  const r = m.rush;
  if (!r || r.phase !== "prep" || !r.event) return m;
  const inPlay = new Set(m.tanks.map((t) => t.id));
  const tankIds = r.event.tankIds.filter((id) => inPlay.has(id));
  if (tankIds.length === r.event.tankIds.length) return m;
  if (!tankIds.length) return { ...m, rush: { ...newRushState(), unlocked: r.unlocked, introSeen: r.introSeen, stats: r.stats, rewards: r.rewards, lastCommitted: r.lastCommitted, untilNext: NEXT_DELAY[0] } };
  const prepTotal = prepSeconds(tankIds.length);
  return { ...m, rush: { ...r, event: { ...r.event, tankIds, ready: r.event.ready.filter((id) => inPlay.has(id)), prepTotal, remaining: Math.min(r.event.remaining, prepTotal) } } };
}
