import type { ColorId, DecorKind, DecorVariant, SpeciesId } from "../types";
import { SPECIES } from "../data/fish";
import { decorVersion } from "../data/decor";
import { happiness, HAPPY, type Model, type TankRec } from "./model";

/**
 * Visitor requests. Each is generated only when the aquarium can satisfy it,
 * and "show me" requests prefer aquariums with two or more colours, so the
 * student is choosing, not just tapping the only fish.
 */

export type Request =
  /** "I like blue fish!" (fishOnly) or "I like red!" (any animal or decoration). */
  | { kind: "show"; color: ColorId; fishOnly: boolean }
  /** "I like turtles!": show that animal (Phase 2). */
  | { kind: "showAnimal"; species: SpeciesId }
  /** "How many fish?" about one tank of fish. */
  | { kind: "count"; tankId: string }
  /** "What's this?" about one animal, which glows (Phase 2). */
  | { kind: "whatsThis"; tankId: string; fishId: string }
  /** "Do you like fish?" → "Yes, I do." / "No, I don't." */
  | { kind: "chatLike" }
  /** "What color do you like?" → "I like ___." */
  | { kind: "chatColor" };

export type RequestKind = Request["kind"];

export type ShowTarget = { type: "fish"; species: SpeciesId } | { type: "decor"; kind: DecorKind; variant: DecorVariant };

export function colorOf(t: ShowTarget): ColorId | null {
  return t.type === "fish" ? SPECIES[t.species].color : decorVersion(t.kind, t.variant).color;
}

const isFish = (s: SpeciesId) => SPECIES[s].kind === "fish";

export function matchesShow(req: Extract<Request, { kind: "show" | "showAnimal" }>, t: ShowTarget): boolean {
  if (req.kind === "showAnimal") return t.type === "fish" && t.species === req.species;
  if (req.fishOnly && (t.type !== "fish" || !isFish(t.species))) return false;
  return colorOf(t) === req.color;
}

/** Things in this tank that a "show me" request could point at. */
export function targetsIn(t: TankRec): ShowTarget[] {
  return [
    ...t.fish.map((f): ShowTarget => ({ type: "fish", species: f.species })),
    ...t.decor.map((d): ShowTarget => ({ type: "decor", kind: d.kind, variant: d.variant }))
  ];
}

export function tankSatisfies(req: Extract<Request, { kind: "show" | "showAnimal" }>, t: TankRec): boolean {
  return targetsIn(t).some((x) => matchesShow(req, x));
}

/** Colours present in the aquarium (fish only, or animals and decorations). */
export function presentColors(m: Model, fishOnly: boolean): ColorId[] {
  const out = new Set<ColorId>();
  for (const t of m.tanks) {
    for (const x of targetsIn(t)) {
      if (fishOnly && (x.type !== "fish" || !isFish(x.species))) continue;
      const c = colorOf(x);
      if (c) out.add(c);
    }
  }
  return [...out];
}

/** Sea animals (not fish) in the aquarium. */
export function presentAnimals(m: Model): SpeciesId[] {
  return [...new Set(m.tanks.flatMap((t) => t.fish.map((f) => f.species)).filter((s) => !isFish(s)))];
}

/** Tanks a visitor can ask "How many fish?" about: 2–8 animals, all of them fish. */
export function countableTanks(m: Model): TankRec[] {
  return m.tanks.filter((t) => t.fish.length >= 2 && t.fish.length <= 8 && t.fish.every((f) => isFish(f.species)));
}

export interface RequestOptions {
  /** The previous request's kind (never repeated twice in a row). */
  last: RequestKind | null;
}

/** Choose a request the aquarium can satisfy, or null if none fits. */
export function makeRequest(m: Model, rand: () => number, opts: RequestOptions): Request | null {
  const stage = m.progress.stage;
  // From Stage 4, "I like red!" may point at decorations as well as fish.
  const anyColor = (stage >= 4 || m.progress.star) && rand() < 0.5;
  const showColors = presentColors(m, !anyColor);
  const counts = countableTanks(m);
  const animals = presentAnimals(m);
  const options: { kind: RequestKind; weight: number }[] = [];
  if (showColors.length) options.push({ kind: "show", weight: showColors.length >= 2 ? 40 : 12 });
  if (counts.length) options.push({ kind: "count", weight: 26 });
  if (animals.length && stage >= 6) {
    options.push({ kind: "showAnimal", weight: 18 });
    // "What's this?" is Level 7's goal: it comes often then.
    options.push({ kind: "whatsThis", weight: stage === 7 ? 50 : 20 });
  }
  if (m.tanks.some((t) => t.fish.length)) {
    options.push({ kind: "chatLike", weight: 10 });
    options.push({ kind: "chatColor", weight: 12 });
  }
  const pool = options.filter((o) => o.kind !== opts.last);
  const list = pool.length ? pool : options;
  if (!list.length) return null;
  const total = list.reduce((n, o) => n + o.weight, 0);
  let r = rand() * total;
  let kind = list[list.length - 1].kind;
  for (const o of list) {
    r -= o.weight;
    if (r <= 0) {
      kind = o.kind;
      break;
    }
  }
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  switch (kind) {
    case "show":
      return { kind: "show", color: pick(showColors), fishOnly: !anyColor };
    case "count":
      return { kind: "count", tankId: pick(counts).id };
    case "showAnimal":
      return { kind: "showAnimal", species: pick(animals) };
    case "whatsThis": {
      const homes = m.tanks.filter((t) => t.fish.some((f) => !isFish(f.species)));
      const t = pick(homes);
      const f = pick(t.fish.filter((x) => !isFish(x.species)));
      return { kind: "whatsThis", tankId: t.id, fishId: f.id };
    }
    default:
      return { kind };
  }
}

/** What the visitor says. */
export function requestLine(req: Request): string {
  switch (req.kind) {
    case "show":
      return req.fishOnly ? `I like ${req.color} fish!` : `I like ${req.color}!`;
    case "showAnimal":
      return `I like ${SPECIES[req.species].plural}!`;
    case "count":
      return "How many fish?";
    case "whatsThis":
      return "What's this?";
    case "chatLike":
      return "Do you like fish?";
    case "chatColor":
      return "What color do you like?";
  }
}

/** Coins for a helped request: 10, +5 when the tank involved is happy; chats pay 8. */
export function requestReward(req: Request, tank: TankRec | null): number {
  if (req.kind === "chatLike" || req.kind === "chatColor") return 8;
  const h = tank ? happiness(tank) : null;
  return 10 + (h !== null && h >= HAPPY ? 5 : 0);
}

/** Is this request still possible (animals can be added or moved while a visitor waits)? */
export function stillValid(m: Model, req: Request): boolean {
  if (req.kind === "show") return presentColors(m, req.fishOnly).includes(req.color);
  if (req.kind === "showAnimal") return presentAnimals(m).includes(req.species);
  if (req.kind === "count") {
    const t = m.tanks.find((x) => x.id === req.tankId);
    return Boolean(t && t.fish.length >= 1 && t.fish.length <= 8 && t.fish.every((f) => isFish(f.species)));
  }
  if (req.kind === "whatsThis") {
    const t = m.tanks.find((x) => x.id === req.tankId);
    return Boolean(t && t.fish.some((f) => f.id === req.fishId));
  }
  return m.tanks.some((t) => t.fish.length);
}
