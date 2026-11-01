import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { SPECIES } from "../game/data/fish";
import { STAND_H, TANKS } from "../game/data/tanks";
import { footprintContains, sandDune, sandSurfaceY } from "../game/logic/tankLayout";
import { animalGeometry, deformGroundVertex } from "./models/animals";
import { containEel, createGroundPose, groundAnimal, groundedVertex } from "./grounding";

describe("visible sand grounding", () => {
  for (const species of ["crab", "octopus", "goby"] as const) for (const habitat of SPECIES[species].habitat) {
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
  it("contains the moray's complete waving envelope in front of solid back rock", () => {
    const tank = TANKS.cave, g = animalGeometry("eel"), p=g.getAttribute("position"), out=new THREE.Vector3(), v=new THREE.Vector3();
    for (let yaw=0;yaw<Math.PI*2;yaw+=.3) for (const x of [0,.7]) {
      containEel(out,tank,x,.2,0,yaw);
      for(let i=0;i<p.count;i++) {
        v.fromBufferAttribute(p,i);
        const back = Math.max(0, Math.min(1, -v.x/SPECIES.eel.length-.05));
        v.z += (Math.sin(i)*(.036+.045*1.8)+back*.09)*back*SPECIES.eel.length;
        v.applyAxisAngle(THREE.Object3D.DEFAULT_UP,yaw).add(out);
        expect(v.z).toBeGreaterThanOrEqual(-tank.d/2+(tank.backRock??0));
        expect(v.z).toBeLessThan(tank.d/2);
        expect(Math.abs(v.x)).toBeLessThan(tank.w/2);
        for (const rock of tank.rocks ?? []) if (Math.hypot(v.x-rock.x,v.z-rock.z)<rock.r) expect(v.y).toBeGreaterThan(rock.top);
      }
    }
  });
});
