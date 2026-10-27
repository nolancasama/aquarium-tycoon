import { rt, effect } from "../runtime";
import { getGame, nudge } from "../store";
import { happiness, mood, type Model, type Mood } from "../logic/model";
import { waterCentre } from "../world";
import { TANKS } from "../data/tanks";

const RANK: Record<Mood, number> = { sad: 0, okay: 1, happy: 2 };

/**
 * Celebrate happiness going up (care only raises it; time only lowers it). Any
 * rise pops the tank's indicator; reaching okay sparkles; reaching happy shows
 * hearts, and once per tank per session Pico says that happy fish earn more
 * (in his bottom-left bubble, clear of the tanks, never over another hint). The
 * first look at a tank (load, first animal) is silent. No coins are paid here.
 */
export function watchHappiness(m: Model) {
  const live = new Set<string>();
  for (const t of m.tanks) {
    const h = happiness(t);
    if (h === null) continue;
    live.add(t.id);
    const md = mood(h);
    const prev = rt.moods.get(t.id);
    rt.moods.set(t.id, { h, mood: md });
    if (!prev || h <= prev.h) continue;
    const up = RANK[md] > RANK[prev.mood];
    rt.cheer.set(t.id, { t0: rt.time, level: up ? md === "happy" ? "happy" : "okay" : "up" });
    if (!up) continue;
    const c = waterCentre(t.slot, t.type);
    const top = c.y + TANKS[t.type].h / 2;
    if (md === "happy") {
      effect("hearts", c.x, top, c.z, 5);
      effect("sparkle", c.x, top - 0.1, c.z, 10);
      if (m.progress.tutorial === "done" && !rt.happyToasted.has(t.id) && !getGame().nudge) {
        rt.happyToasted.add(t.id);
        nudge({ en: "Happy fish earn more coins!", ja: "ハッピーな さかなは コインが ふえるよ！" }, 4500);
      }
    } else effect("sparkle", c.x, top - 0.1, c.z, 6);
  }
  for (const id of rt.moods.keys()) if (!live.has(id)) rt.moods.delete(id);
}
