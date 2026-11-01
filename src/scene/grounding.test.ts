import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { SPECIES } from "../game/data/fish";
import { STAND_H, TANKS } from "../game/data/tanks";
import { footprintContains, sandDune, sandSurfaceY } from "../game/logic/tankLayout";
import { deformEelVertex, EEL_LENGTH } from "../game/logic/eelBody";
import { animalGeometry, deformGroundVertex } from "./models/animals";
import { createGroundPose, groundAnimal, groundedVertex } from "./grounding";

describe("visible sand grounding", () => {
  for (const species of ["crab", "goby"] as const) for (const habitat of SPECIES[species].habitat) {
    it(`${species}: real lower hull and feet clear dunes and glass in ${habitat}`, () => {
      const tank = TANKS[habitat], dune = sandDune(tank), geometry = animalGeometry(species);
      const vertices = geometry.getAttribute("position"), wave = geometry.getAttribute("wave");
      const pose = createGroundPose(), v = new THREE.Vector3();
      let minClearance = Infinity, maxStanceGap = 0, outside = false, buriedBody = false;
      for (const [x,z] of [[dune.x,dune.z],[dune.x+dune.radius*.7,dune.z],[dune.x,dune.z+dune.radius*.4],[-tank.w/2,-tank.d/2],[tank.w/2,tank.d/2],[0,0]]) {
        for (const yaw of [0, .7, 1.57, 3.8]) for (const phase of [0, .8, 2.1, 3.9, 5.5]) {
          groundAnimal(pose,species,tank,x,z,yaw,phase,1,0,2,1/30);
          const gaps = new Float64Array(8).fill(Infinity);
          for (let i=0;i<vertices.count;i++) {
            v.fromBufferAttribute(vertices,i);
            const part = wave.getX(i), w = wave.getY(i), tag = wave.getZ(i), foot = Math.round(wave.getW(i));
            deformGroundVertex(v,species,part,w,tag,phase,1,0,2);
            if (part === 3 || part === 4) v.y += pose.feet[foot] * w**3;
            v.applyMatrix3(pose.rotation); v.x += pose.x; v.y += pose.y; v.z += pose.z;
            const rawGap = v.y - (sandSurfaceY(tank,v.x,v.z)-STAND_H);
            if (part !== 3 && part !== 4 && rawGap < -0.0001) buriedBody = true;
            if (part === 4 && w > .999 && Math.sin(phase+tag) <= 0) gaps[foot] = Math.min(gaps[foot],rawGap);
            groundedVertex(v,species,i,pose,tank,phase,1,0,2);
            minClearance = Math.min(minClearance,v.y-(sandSurfaceY(tank,v.x,v.z)-STAND_H));
            if (!footprintContains(tank,v.x,v.z,.005) || v.z < -tank.d/2+(tank.backRock??0)) outside = true;
          }
          for (const gap of gaps) if (Number.isFinite(gap)) { maxStanceGap = Math.max(maxStanceGap,gap); expect(gap).toBeGreaterThan(-0.001); }
        }
      }
      expect(minClearance).toBeGreaterThanOrEqual(.00099);
      expect(buriedBody).toBe(false);
      expect(outside).toBe(false);
      if (species === "crab") expect(maxStanceGap).toBeLessThan(.004);
    });
  }
  it("filters dune slope and height while keeping a stable shell above support", () => {
    const pose = createGroundPose(), tank = TANKS.ocean;
    let lastY = 0, lastPitch = 0;
    for (let i=0;i<100;i++) {
      groundAnimal(pose,"crab",tank,-1+i*.012,-.15,0,i*.1,1,0,i/30,1/30);
      if (i>0) { expect(Math.abs(pose.y-lastY)).toBeLessThan(.007); expect(Math.abs(pose.pitch-lastPitch)).toBeLessThan(.04); }
      lastY=pose.y; lastPitch=pose.pitch;
    }
    expect(Math.abs(pose.pitch)).toBeGreaterThan(.001);
  });
  it("keeps the lofted moray dorsal base on the actual body top through every bend", () => {
    const geometry = animalGeometry("eel"), positions = geometry.getAttribute("position"), wave = geometry.getAttribute("wave");
    const rig = new Float32Array(16 * 4), body = new THREE.Vector3(), fin = new THREE.Vector3();
    const sampledRings = new Set<number>();
    for (const curvature of [0, 2, -2, Math.PI / EEL_LENGTH, -Math.PI / EEL_LENGTH]) {
      for (let i = 0; i < 16; i++) {
        const distance = i / 15 * EEL_LENGTH;
        rig[i * 4] = curvature ? -Math.sin(distance * curvature) / curvature : -distance;
        rig[i * 4 + 1] = .25 + Math.sin(distance * 2) * .045;
        rig[i * 4 + 2] = curvature ? (1 - Math.cos(distance * curvature)) / curvature : 0;
      }
      for (let i = 0; i < positions.count; i++) {
        if (wave.getX(i) !== 12 || wave.getW(i) !== 1) continue;
        const s = wave.getY(i);
        sampledRings.add(Math.round(s * 10000));
        let top = -1;
        for (let j = 0; j < positions.count; j++) {
          if (wave.getX(j) === 12 && wave.getW(j) === 0 && wave.getZ(j) === 0
            && Math.abs(wave.getY(j) - s) < 1e-6 && Math.abs(positions.getZ(j)) < 1e-7
            && Math.abs(positions.getY(j) - positions.getY(i)) < 1e-7) { top = j; break; }
        }
        expect(top, `body ring at s=${s}`).toBeGreaterThanOrEqual(0);
        deformEelVertex(fin, rig, positions.getX(i), positions.getY(i), positions.getZ(i), s);
        deformEelVertex(body, rig, positions.getX(top), positions.getY(top), positions.getZ(top), wave.getY(top));
        expect(fin.distanceTo(body), `dorsal attachment at s=${s}, bend=${curvature}`).toBeLessThan(1e-6);
      }
    }
    expect(sampledRings.size).toBe(29);
  });
});
