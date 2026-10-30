import type { RequestUi, View } from "../store";
import { matchesShow, tankSatisfies, type ShowTarget } from "./requests";
import { tankById, type Model } from "./model";

export type RequestStep = {
  step: "visitor" | "tank" | "fish" | "animal" | "thing" | "exact";
  tier: 1 | 2 | 3;
  tankIds: string[];
  fishIds: string[];
  decorIds: string[];
  exact?: ShowTarget;
};

/** Derive instructions and highlight targets from the request and current view.
 * Tier one never exposes a matching target. Idle only reveals the tank tier. */
export function requestStep({ request, view, tankId, model, waiting }: {
  request: RequestUi | null;
  view: View;
  tankId: string | null;
  model: Model;
  waiting?: unknown;
}): RequestStep | null {
  const empty = { tankIds: [], fishIds: [], decorIds: [] };
  if (!request) return waiting ? { step: "visitor", tier: 1, ...empty } : null;
  if (request.status === "correct") return null;
  const req = request.req;
  if (req.kind !== "show" && req.kind !== "showAnimal") return null;
  const tier = request.misses >= 3 ? 3 : request.misses > 0 || request.idleHint ? 2 : 1;
  const tanks = model.tanks.filter((t) => tankSatisfies(req, t));
  const here = tankId ? tankById(model, tankId) : null;
  const needTank = view === "room" || !here || (tier >= 2 && !tankSatisfies(req, here));
  const base: RequestStep = {
    step: needTank ? "tank" : req.kind === "showAnimal" ? "animal" : req.fishOnly ? "fish" : "thing",
    tier,
    tankIds: tier >= 2 ? tanks.map((t) => t.id) : [],
    fishIds: [],
    decorIds: []
  };
  if (tier < 3) return base;
  for (const t of tanks) {
    for (const f of t.fish) if (matchesShow(req, { type: "fish", species: f.species })) {
      base.fishIds.push(f.id);
      if ((!needTank && t.id === tankId) || !base.exact) base.exact = { type: "fish", species: f.species };
    }
    for (const d of t.decor) if (matchesShow(req, { type: "decor", kind: d.kind, variant: d.variant })) {
      base.decorIds.push(`${t.id}:${d.slot}`);
      if ((!needTank && t.id === tankId && !base.fishIds.some((id) => t.fish.some((f) => f.id === id))) || !base.exact) base.exact = { type: "decor", kind: d.kind, variant: d.variant };
    }
  }
  if (!needTank) base.step = "exact";
  return base;
}
