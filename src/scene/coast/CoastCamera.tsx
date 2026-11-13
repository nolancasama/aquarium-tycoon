import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { coastCameraTick, releaseCoastCamera } from "../../game/flow/coast";

/** Run before the shared rig; that rig still owns projection and HUD lens shift. */
export function CoastCamera() {
  useEffect(() => releaseCoastCamera, []);
  useFrame(({ size }, dt) => coastCameraTick(size.width / Math.max(1, size.height), Math.min(dt, 0.1)), -0.5);
  return null;
}
