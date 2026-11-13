import { DOLPHINS, type DolphinId } from "./lagoon";
import type { FishRec, Model } from "./model";

export type NamingArea = "coast" | "lagoon";

/** Shared by input and save decoding. Count Unicode code points, never UTF-16 units. */
export function cleanAnimalName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/gu, " ")
    .replace(/[^\p{Script=Latin}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}0-9 '\-ー]/gu, "")
    .trim();
  return Array.from(cleaned).slice(0, 12).join("").trim() || undefined;
}

export function readDolphinNames(value: unknown): Model["dolphinNames"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result: Partial<Record<DolphinId, string>> = {};
  for (const d of DOLPHINS) {
    const name = cleanAnimalName((value as Record<string, unknown>)[d.id]);
    if (name) result[d.id] = name;
  }
  return Object.keys(result).length ? result : undefined;
}

function penguin(model: Model, id: string): FishRec | undefined {
  return [...model.tanks, ...(model.stored?.tanks ?? [])].flatMap((t) => t.fish)
    .concat(model.inv.fish, model.stored?.fish ?? []).find((f) => f.id === id && f.species === "penguin");
}

// Friendly defaults derive from the persistent id, so array order never changes them.
const PENGUIN_DEFAULTS = ["Pip", "Pebble", "Snow", "Sunny", "Poppy", "Bubbles"];
export function animalName(model: Model, area: NamingArea, id: string): string {
  if (area === "lagoon") return model.dolphinNames?.[id as DolphinId] ?? DOLPHINS.find((d) => d.id === id)?.name ?? "Dolphin";
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.codePointAt(0)!) >>> 0;
  return penguin(model, id)?.name ?? PENGUIN_DEFAULTS[hash % PENGUIN_DEFAULTS.length];
}

/** Copy every changed container: a preview retains the untouched pre-preview model. */
export function renameAnimal(model: Model, area: NamingArea, id: string, value: unknown): Model {
  const name = cleanAnimalName(value);
  if (area === "lagoon") {
    if (!DOLPHINS.some((d) => d.id === id)) return model;
    const dolphinNames = { ...model.dolphinNames };
    if (name) dolphinNames[id as DolphinId] = name;
    else delete dolphinNames[id as DolphinId];
    const { dolphinNames: _old, ...rest } = model;
    return Object.keys(dolphinNames).length ? { ...rest, dolphinNames } : rest;
  }
  if (!penguin(model, id)) return model;
  const rename = (f: FishRec): FishRec => {
    if (f.id !== id || f.species !== "penguin") return f;
    const { name: _old, ...rest } = f;
    return name ? { ...rest, name } : rest;
  };
  const tanks = (items: Model["tanks"]) => items.map((t) => t.fish.some((f) => f.id === id) ? { ...t, fish: t.fish.map(rename) } : t);
  return {
    ...model, tanks: tanks(model.tanks), inv: { ...model.inv, fish: model.inv.fish.map(rename) },
    ...(model.stored ? { stored: { ...model.stored, tanks: tanks(model.stored.tanks), fish: model.stored.fish.map(rename) } } : {})
  };
}
