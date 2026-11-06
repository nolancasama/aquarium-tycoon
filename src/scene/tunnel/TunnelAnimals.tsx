import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { tunnelRuntime, type SwimAnimal, type SwimVolume, type TunnelSpecies } from "../../game/tunnel/contract";
import { createTunnelSwim } from "../../game/tunnel/swim3d";
import { createSharkGeometry, MODEL_LENGTHS } from "../models/sharks";
import { bindSharkUniforms, createSharkMaterial, tunnelAnimationTime, TUNNEL_SPINE_SAMPLES, type TunnelAnimalUniforms } from "./sharkMaterials";

const SPECIES: readonly TunnelSpecies[] = ["blacktip", "zebrashark", "eagleray"];

export function TunnelAnimals({ animals, volume, detail = "management", paused = false }: {
  animals: readonly SwimAnimal[];
  volume: SwimVolume;
  detail?: "management" | "close";
  paused?: boolean;
}) {
  const swim = useMemo(() => tunnelRuntime.swim ?? createTunnelSwim(volume, 1827), []);
  const resources = useMemo(() => SPECIES.map(species => ({
    species, material: createSharkMaterial(species),
    close: createSharkGeometry(species, "close"), far: createSharkGeometry(species, "far")
  })), []);
  const entries = useMemo(() => animals.map(animal => {
    const resource = resources.find(r => r.species === animal.species)!;
    const mesh = new THREE.Mesh(resource.far, resource.material);
    const uniforms: TunnelAnimalUniforms = {
      spine: new Float32Array(TUNNEL_SPINE_SAMPLES * 3), length: MODEL_LENGTHS[animal.species],
      phase: 0, time: 0, speed: 0, bank: 0, resting: false
    };
    mesh.name = `tunnel-animal-${animal.id}`;
    mesh.userData.animalId = animal.id;
    // The shader's curved world-space bounds differ from the rest-pose bounds.
    mesh.frustumCulled = false;
    mesh.onBeforeRender = () => bindSharkUniforms(resource.material, uniforms);
    return { id: animal.id, species: animal.species, mesh, uniforms, resource };
  }), [animals, resources]);
  const clock = useRef({ time: 0, override: null as number | null });

  useLayoutEffect(() => {
    tunnelRuntime.swim = swim;
    swim.setVolume(volume);
    swim.sync(animals);
  }, [swim, volume, animals]);
  useEffect(() => () => {
    // Keep the simulation in runtime across management/exploration remounts.
    for (const resource of resources) {
      resource.material.dispose();
      resource.close.dispose();
      resource.far.dispose();
    }
  }, [resources]);

  useFrame(({ camera }, delta) => {
    const dt = paused ? 0 : Math.min(delta, 0.1);
    if (dt > 0) swim.step(dt);
    const override = tunnelAnimationTime.value;
    let animationDelta = dt;
    if (override !== null) {
      animationDelta = clock.current.override === null ? Math.max(0, override) : Math.max(0, override - clock.current.override);
      clock.current.time = override;
    } else clock.current.time += dt;
    clock.current.override = override;
    const poses = swim.poses();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      let pose = poses[i];
      if (pose?.id !== entry.id) {
        for (let j = 0; j < poses.length; j++) if (poses[j].id === entry.id) { pose = poses[j]; break; }
      }
      if (!pose || pose.id !== entry.id || !swim.spine(entry.id, entry.uniforms.spine, TUNNEL_SPINE_SAMPLES)) {
        entry.mesh.visible = false;
        continue;
      }
      entry.mesh.visible = true;
      entry.mesh.position.set(pose.x, pose.y - (pose.restDrop ?? 0), pose.z);
      const spine = entry.uniforms.spine;
      for (let j = 0; j < spine.length; j += 3) {
        spine[j] -= pose.x; spine[j + 1] -= pose.y; spine[j + 2] -= pose.z;
      }
      const ray = entry.species === "eagleray";
      entry.uniforms.phase += animationDelta * (ray ? 1.3 + pose.speed * 1.8 : 2.4 + pose.speed * 4.4);
      entry.uniforms.time = clock.current.time;
      entry.uniforms.speed = pose.speed;
      entry.uniforms.bank = pose.bank;
      entry.uniforms.resting = pose.resting;
      const distance2 = camera.position.distanceToSquared(entry.mesh.position);
      // Management starts far; either view permits a near inspection. Hysteresis
      // prevents flickering geometry when the camera rests at the threshold.
      const close = entry.mesh.geometry === entry.resource.close;
      const limit = detail === "management" ? (close ? 8 : 6) : (close ? 20 : 17);
      entry.mesh.geometry = distance2 < limit * limit ? entry.resource.close : entry.resource.far;
    }
  }, -4);

  return <group name="tunnel-animals">{entries.map(entry => <primitive key={entry.id} object={entry.mesh} dispose={null} />)}</group>;
}
