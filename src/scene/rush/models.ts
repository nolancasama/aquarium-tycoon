import * as THREE from "three";
import { PartBuilder } from "../partBuilder";

const teal = "#218e98", wood = "#b97c49", gold = "#ffd064", cream = "#fff0c8";

/** Flat reliefs have deliberately different outlines, as well as different metals. */
function animal(b: PartBuilder, kind: number, x: number, y: number, z: number, s: number, color: string) {
  const outlines = [
    [[-.9, 0], [-.5, .3], [.3, .3], [.65, 0], [.3, -.3], [-.5, -.3], [-.9, -.5], [-.9, .5]],
    [[0, .4], [.3, .1], [.95, -.25], [.3, -.3], [0, -.8], [-.08, -.3], [-.95, -.25], [-.3, .1]],
    [[-1, .25], [-.65, .05], [-.25, .16], [0, .65], [.18, .18], [.75, .08], [1, -.04], [.6, -.18], [.1, -.18], [-.15, -.45], [-.3, -.15], [-.7, -.1], [-1, -.4], [-.87, -.02]]
  ];
  const shape = new THREE.Shape();
  outlines[kind].forEach(([a, c], i) => i ? shape.lineTo(a, c) : shape.moveTo(a, c));
  shape.closePath();
  b.add(new THREE.ExtrudeGeometry(shape, { depth: .09, bevelEnabled: false }), color, [x, y, z], [0, 0, 0], [s, s, s]);
}

export function cabinetGeometry(medals: readonly boolean[]) {
  const b = new PartBuilder();
  b.box(1.5, .16, .56, 0, 0, 0, wood);
  b.box(1.42, 1.65, .07, 0, .16, -.24, teal);
  for (const x of [-.7, .7]) b.box(.1, 1.8, .52, x, .1, 0, wood);
  b.box(1.56, .13, .58, 0, 1.88, 0, teal);
  for (const y of [.22, .91, 1.52]) b.box(1.35, .05, .48, 0, y, 0, cream);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * .44;
    b.box(.29, .06, .27, x, .96, .02, wood);
    if (medals[i]) {
      b.boxAt(.075, .18, .025, [x - .045, 1.36, .03], [0, 0, -.25], "#ee725b");
      b.boxAt(.075, .18, .025, [x + .045, 1.36, .03], [0, 0, .25], "#69c9ea");
      b.cylAt(.145, .045, [x, 1.23, .065], [Math.PI / 2, 0, 0], ["#d58b50", "#cde3f2", gold][i], 16);
      animal(b, i, x, 1.23, .096, .115, "#4d6570");
    }
  }
  for (const x of [-.4, 0, .4]) {
    b.box(.22, .035, .24, x, .28, .02, "#84b8b8");
    b.torus(.065, .009, [x, .5, -.18], [0, 0, 0], "#84b8b8");
  }
  return b.build();
}

export function rewardGeometry(kind: "floorPattern" | "goldSign" | "bubbleFountain" | "bench" | "sharkStatue") {
  const b = new PartBuilder();
  if (kind === "floorPattern") {
    b.add(new THREE.RingGeometry(.605, .65, 32), "#85bcd4", [0, .012, 0], [-Math.PI / 2, 0, 0]);
    b.add(new THREE.RingGeometry(.49, .51, 32), "#d3e7f0", [0, .012, 0], [-Math.PI / 2, 0, 0]);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      b.add(new THREE.ConeGeometry(.08, .36, 3), i % 2 ? "#b1d8e9" : "#6099b5", [Math.sin(a) * .22, .015, Math.cos(a) * .22], [Math.PI / 2, 0, -a], [1, 1, .04]);
    }
  } else if (kind === "goldSign") {
    b.box(1.2, .58, .06, 0, -.29, 0, gold);
    b.box(1.08, .46, .035, 0, -.23, .045, teal);
    animal(b, 2, 0, 0, .07, .4, gold);
    for (const x of [-.49, .49]) b.sphere(.025, x, .19, .08, cream, [1, 1, .4], 6);
  } else if (kind === "bubbleFountain") {
    b.cyl(.38, .44, .13, 0, 0, 0, cream, 16);
    b.cyl(.43, .36, .28, 0, .13, 0, teal, 16);
    b.cyl(.35, .35, .025, 0, .375, 0, "#6ddbee", 16);
    b.torus(.385, .035, [0, .41, 0], [Math.PI / 2, 0, 0], gold);
    b.cyl(.07, .12, .3, 0, .38, 0, cream);
    animal(b, 0, 0, .77, -.025, .22, gold);
  } else if (kind === "bench") {
    for (const x of [-.48, .48]) for (const z of [-.18, .18]) b.box(.075, .36, .075, x, 0, z, gold);
    for (const z of [-.16, 0, .16]) b.box(1.22, .07, .13, 0, .36, z, teal);
    for (const x of [-.55, .55]) b.box(.065, .7, .065, x, .08, -.23, gold);
    for (let i = 0; i < 9; i++) b.box(.125, .12, .07, (i - 4) * .13, .57 + Math.sin(i * .8) * .06, -.23, teal);
    b.box(1.25, .04, .09, 0, .77, -.23, gold);
  } else {
    b.cyl(.36, .4, .14, 0, 0, 0, teal, 12);
    b.cyl(.29, .32, .45, 0, .14, 0, cream, 8);
    b.cyl(.33, .33, .06, 0, .59, 0, gold, 12);
    b.cyl(.035, .05, .2, 0, .65, 0, gold);
    // A volumetric low-poly shark, facing right, mounted above its plinth.
    b.sphere(.24, 0, .98, 0, gold, [1.8, .65, .65], 10);
    animal(b, 2, 0, .99, -.025, .48, gold);
    b.add(new THREE.ConeGeometry(.19, .35, 3), gold, [0, .94, 0], [0, 0, Math.PI / 2], [1, 1, 1.7]);
    b.sphere(.023, .34, 1.02, .12, "#244b58", [1, 1, .5], 6);
  }
  return b.build();
}
