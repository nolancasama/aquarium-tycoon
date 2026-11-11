import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { bayOf, doorLocal, HUB_CENTRE, HUB_DOORS, HUB_R, HUB_WINDOW, hubDoorOpen, onRing, type HubDestination } from "../../game/data/hub";
import { hubGroups, memberWorld, setupHubReviewJourney } from "../../game/hub/hubVisitors";
import { getGame, updateModel } from "../../game/store";
import { anyPreview } from "../../game/data/release";

/** Opt-in production review instrumentation. It never moves the gameplay camera. */
export function HubReview() {
  const { camera, size } = useThree();
  useEffect(() => {
    if (new URLSearchParams(location.search).get("e2e") !== "1") return;
    const project = (x: number, y: number, z: number) => {
      const v = new Vector3(x, y, z).project(camera);
      return { x: (v.x + 1) * size.width / 2, y: (1 - v.y) * size.height / 2 };
    };
    const bounds = (points: { x: number; y: number }[]) => {
      const x = Math.max(0, Math.floor(Math.min(...points.map((p) => p.x)) - 12));
      const y = Math.max(0, Math.floor(Math.min(...points.map((p) => p.y)) - 12));
      return { x, y, width: Math.min(size.width - x, Math.ceil(Math.max(...points.map((p) => p.x)) + 12 - x)), height: Math.min(size.height - y, Math.ceil(Math.max(...points.map((p) => p.y)) + 12 - y)) };
    };
    const api = {
      state: () => ({
        doors: Object.fromEntries(HUB_DOORS.map((kind) => [kind, hubDoorOpen(kind, getGame().model.progress)])),
        groups: hubGroups.map((g) => ({ ...g, members: g.members.map((m) => ({ ...m, world: memberWorld(g, m) })) })),
        window: bounds(Array.from({ length: 17 }, (_, i) => {
          const p = onRing(-HUB_WINDOW.halfAngle + i / 16 * HUB_WINDOW.halfAngle * 2, HUB_R);
          return [project(p.x, HUB_WINDOW.bottom, p.z), project(p.x, HUB_WINDOW.top, p.z)];
        }).flat()),
        doorway: Object.fromEntries(HUB_DOORS.map((kind) => [kind, bounds([-1.85, 1.85].flatMap((side) => {
          const p = doorLocal(kind, side, -0.2);
          return [project(p.x, 0, p.z), project(p.x, 5.3, p.z)];
        }))])),
        centre: HUB_CENTRE,
        angles: Object.fromEntries(HUB_DOORS.map((k) => [k, bayOf(k).angle]))
      }),
      journey: (kind: HubDestination, direction: "arrival" | "departure") => {
        if (!hubDoorOpen(kind, getGame().model.progress)) throw new Error("Review journey requires an open doorway");
        return setupHubReviewJourney(kind, direction);
      },
      tunnel: (open: boolean) => {
        if (!anyPreview()) throw new Error("Review tunnel fixture requires a save-isolated preview");
        updateModel((m) => ({ ...m, progress: { ...m.progress, tunnelOpen: open } }));
      }
    };
    const target = window as unknown as { __hubReview?: typeof api };
    target.__hubReview = api;
    return () => { delete target.__hubReview; };
  }, [camera, size.width, size.height]);
  return null;
}
