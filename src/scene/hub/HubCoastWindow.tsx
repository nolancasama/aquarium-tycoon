import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { HUB_CENTRE, HUB_R } from "../../game/data/hub";
import { rt } from "../../game/runtime";
import { signMaterial } from "../materials";
import { hubCloudTexture, hubCoastalExteriorTexture } from "./hubArt";

/** Four inexpensive curved cards sit 4–7 m outside the wall. The opaque sky/sea
 * is behind three cutout cloud layers; no blending, lights or offscreen passes. */
export function HubCoastWindow() {
  const resources = useMemo(() => {
    const arc = (radius: number, height: number) => new THREE.CylinderGeometry(radius, radius, height, 28, 1, true, Math.PI - 0.57, 1.14);
    const background = new THREE.MeshBasicMaterial({ map: hubCoastalExteriorTexture(), side: THREE.BackSide, toneMapped: false });
    const clouds = [0, 1, 2].map(i => {
      const texture = hubCloudTexture(i).clone();
      texture.wrapS = THREE.RepeatWrapping;
      texture.repeat.x = 1.5 + i * 0.4;
      texture.needsUpdate = true;
      return new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, alphaTest: 0.45, toneMapped: false });
    });
    // Crop the distant card to world y=-9..4. Its top remains behind plaster
    // even from the raised overview camera; original UVs keep the horizon fixed.
    const sky = arc(HUB_R + 7, 13), uv = sky.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 13 / 18);
    return { background, sky, clouds, shapes: clouds.map((_, i) => arc(HUB_R + 6 - i, 1.05 + i * 0.18)) };
  }, []);
  useEffect(() => () => {
    resources.background.dispose(); resources.sky.dispose();
    resources.clouds.forEach(m => { m.map?.dispose(); m.dispose(); });
    resources.shapes.forEach(g => g.dispose());
  }, [resources]);
  useFrame(() => {
    // A repeatable tile makes crossing an integer offset perfectly seamless.
    resources.clouds.forEach((m, i) => { m.map!.offset.x = (rt.time * (0.008 + i * 0.005) + i * 0.27) % 1; });
  });
  const big = signMaterial("GRAND AQUARIUM\nグランド すいぞくかん", "#14506a", "#fff6da", 1024, 300);
  return <group>
    <group position={[HUB_CENTRE.x, 0, HUB_CENTRE.z]}>
      <mesh position={[0, -2.5, 0]} geometry={resources.sky} material={resources.background} renderOrder={-4} raycast={() => undefined} />
      {resources.clouds.map((mat, i) => <mesh key={i} position={[0, 1.7 + i * 0.75, 0]} geometry={resources.shapes[i]} material={mat} renderOrder={-3 + i} raycast={() => undefined} />)}
    </group>
    <mesh position={[HUB_CENTRE.x, 5.45, HUB_CENTRE.z - HUB_R + 0.6]} material={big} raycast={() => undefined}><planeGeometry args={[5.4, 1.58]} /></mesh>
  </group>;
}
