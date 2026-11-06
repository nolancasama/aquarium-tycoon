import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { getGame } from "../../game/store";
import { SHARKS_HALL } from "../../game/data/rooms";
import { rt } from "../../game/runtime";

/**
 * Only the active area is drawn: the four rooms while they are shown, the
 * Shark Tunnel wing while it is shown. Hidden objects are also taken off
 * layer 0, because react-three-fiber raycasts invisible objects: a tap aimed
 * at the habitat must never reach a tank in the hidden Atrium, and vice versa.
 */
export function wingShown(): boolean {
  const g = getGame();
  return g.screen === "game" && (g.hall === SHARKS_HALL || rt.explore.active);
}

const HIDDEN_LAYER = 30;

function setLayer(root: THREE.Object3D, on: boolean) {
  root.traverse((o) => {
    if (on) o.layers.enable(0);
    else o.layers.set(HIDDEN_LAYER);
  });
}

/** Keeps a group visible (and tappable) only while `active()` holds. */
export function useAreaGate(active: () => boolean) {
  const ref = useRef<THREE.Group>(null);
  const state = useRef<{ on: boolean | null; t: number }>({ on: null, t: 0 });
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const on = active();
    const s = state.current;
    s.t += dt;
    // Re-apply now and then: objects mounted while hidden start on layer 0.
    if (on !== s.on || (!on && s.t > 0.5)) {
      g.visible = on;
      setLayer(g, on);
      s.on = on;
      s.t = 0;
    }
  }, -5);
  return ref;
}
