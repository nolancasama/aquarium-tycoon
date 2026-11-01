import { chooseSeat, type Seat } from "../world";
import type { VisitorType } from "../types";

/** One decision per visit, after a tank or on the way home through Hall 1. */
export function planRest(
  visitor: { type: VisitorType; request: unknown; scripted: boolean; restDecided?: boolean },
  room: number, leaving: boolean,
  visitors: readonly { state: string; seatId?: string }[], random: () => number
): { decided: boolean; seat: Seat | null } {
  if (visitor.request || visitor.scripted || visitor.restDecided) return { decided: false, seat: null };
  if (room !== 0 && room !== 3 && !leaving) return { decided: false, seat: null };
  const chance = visitor.type === "grandma" ? 0.4 : visitor.type === "child" ? 0.28 : 0.34;
  return { decided: true, seat: random() < chance ? chooseSeat(room === 3 ? 3 : 0, visitors, random) : null };
}

export const restDuration = (fast: boolean, random: () => number): number => fast ? 0.8 + random() * 0.6 : 6 + random() * 8;
