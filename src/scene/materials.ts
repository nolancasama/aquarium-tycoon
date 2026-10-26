import * as THREE from "three";
import type { SpeciesId } from "../game/types";

/**
 * Shared materials and procedural textures. Everything is vertex-coloured
 * Lambert (cheap on Chromebooks); water, surfaces, swimming and swaying are
 * tiny shader patches driven by one shared time uniform.
 */

export const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const smoothMat = new THREE.MeshLambertMaterial({ vertexColors: true });

/** One clock for every shader (set each frame by the scene). */
export const shaderTime = { value: 0 };

let glow: THREE.CanvasTexture | null = null;
/** Soft radial dot (sparkles, blob shadows, bubbles). */
export function glowTexture(): THREE.CanvasTexture {
  if (glow) return glow;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(c);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

export function shadowMaterial(opacity = 0.3): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map: glowTexture(), color: "#1d3346", transparent: true, opacity, depthWrite: false });
}

export function additiveSprite(color: THREE.ColorRepresentation, opacity = 1): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const cache = new Map<string, THREE.CanvasTexture>();
function cached(key: string, make: () => THREE.CanvasTexture) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

// ------------------------------------------------------------------ shapes

function heartPath(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.35);
  g.bezierCurveTo(x - s * 0.5, y + s * 0.65, x, y + s * 0.8, x, y + s);
  g.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.65, x + s * 0.5, y + s * 0.35);
  g.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.35);
  g.closePath();
}

export const heartTexture = () =>
  cached("heart", () =>
    canvasTex(64, 64, (g) => {
      heartPath(g, 32, 8, 50);
      g.fillStyle = "#ff5c8a";
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = "#fff";
      g.stroke();
    })
  );

export const coinTexture = () =>
  cached("coin", () =>
    canvasTex(64, 64, (g) => {
      g.beginPath();
      g.arc(32, 32, 27, 0, Math.PI * 2);
      g.fillStyle = "#ffc93c";
      g.fill();
      g.lineWidth = 5;
      g.strokeStyle = "#d18a00";
      g.stroke();
      g.fillStyle = "#fff3b0";
      g.beginPath();
      g.arc(25, 24, 6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#d18a00";
      g.font = "bold 30px system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("★", 33, 35);
    })
  );

/** Speech bubbles over visitors: "!" (a request), heart, "…" (hmm), "wow" stars. */
export const bubbleTexture = (kind: "!" | "heart" | "hmm" | "wow") =>
  cached(`bubble-${kind}`, () =>
    canvasTex(96, 96, (g) => {
      g.fillStyle = kind === "!" ? "#ffd23f" : "#ffffff";
      g.strokeStyle = kind === "!" ? "#b57a00" : "#6a8aa8";
      g.lineWidth = 5;
      g.beginPath();
      g.arc(48, 42, 34, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(40, 72);
      g.lineTo(48, 92);
      g.lineTo(58, 70);
      g.closePath();
      g.fill();
      g.textAlign = "center";
      g.textBaseline = "middle";
      if (kind === "!") {
        g.fillStyle = "#7a3b00";
        g.font = "900 52px system-ui, sans-serif";
        g.fillText("!", 48, 45);
      } else if (kind === "heart") {
        heartPath(g, 48, 22, 40);
        g.fillStyle = "#ff5c8a";
        g.fill();
      } else if (kind === "hmm") {
        g.fillStyle = "#5b7ea8";
        g.font = "900 40px system-ui, sans-serif";
        g.fillText("…", 48, 36);
      } else {
        g.fillStyle = "#ffb000";
        g.font = "900 42px system-ui, sans-serif";
        g.fillText("★", 48, 44);
      }
    })
  );

export type BadgeMood = "happy" | "okay" | "sad";

/** Tank status badge: a face, plus food / sponge icons when hungry or dirty. */
export const badgeTexture = (mood: BadgeMood, hungry: boolean, dirty: boolean) =>
  cached(`badge-${mood}-${hungry}-${dirty}`, () =>
    canvasTex(256, 96, (g) => {
      const icons = 1 + (hungry ? 1 : 0) + (dirty ? 1 : 0);
      const w = icons * 80 + 16;
      const x0 = 128 - w / 2;
      g.fillStyle = "rgba(255,255,255,0.92)";
      g.strokeStyle = "rgba(30,80,120,0.5)";
      g.lineWidth = 4;
      g.beginPath();
      g.roundRect(x0, 8, w, 80, 40);
      g.fill();
      g.stroke();
      let x = x0 + 48;
      // Face.
      const face = mood === "happy" ? "#4cd27a" : mood === "okay" ? "#ffcf3f" : "#6aa7ff";
      g.fillStyle = face;
      g.beginPath();
      g.arc(x, 48, 30, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#22313f";
      g.beginPath();
      g.arc(x - 10, 42, 4.5, 0, Math.PI * 2);
      g.arc(x + 10, 42, 4.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#22313f";
      g.lineWidth = 4;
      g.lineCap = "round";
      g.beginPath();
      if (mood === "happy") g.arc(x, 50, 12, 0.15 * Math.PI, 0.85 * Math.PI);
      else if (mood === "okay") {
        g.moveTo(x - 10, 60);
        g.lineTo(x + 10, 60);
      } else g.arc(x, 70, 11, 1.2 * Math.PI, 1.8 * Math.PI);
      g.stroke();
      if (hungry) {
        x += 80;
        // A food shaker.
        g.fillStyle = "#ff8a3d";
        g.beginPath();
        g.roundRect(x - 16, 30, 32, 40, 6);
        g.fill();
        g.fillStyle = "#c95a12";
        g.fillRect(x - 18, 22, 36, 10);
        g.fillStyle = "#ffe0a0";
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.arc(x - 8 + i * 8, 76 + (i % 2) * 4, 3.5, 0, Math.PI * 2);
          g.fill();
        }
      }
      if (dirty) {
        x += 80;
        // A sponge with bubbles.
        g.fillStyle = "#ffe14a";
        g.beginPath();
        g.roundRect(x - 20, 36, 40, 28, 8);
        g.fill();
        g.fillStyle = "#58c26a";
        g.fillRect(x - 20, 56, 40, 8);
        g.strokeStyle = "#9ad3ff";
        g.lineWidth = 3;
        for (const [bx, by, r] of [
          [x - 10, 26, 6],
          [x + 8, 20, 8],
          [x + 18, 34, 5]
        ]) {
          g.beginPath();
          g.arc(bx, by, r, 0, Math.PI * 2);
          g.stroke();
        }
      }
    })
  );

/** Pad icons: a padlock (locked) or a "+" (a tank can go here). */
export const padIconTexture = (kind: "lock" | "plus") =>
  cached(`pad-${kind}`, () =>
    canvasTex(128, 128, (g) => {
      g.fillStyle = kind === "lock" ? "#7a8a99" : "#2fb35a";
      g.beginPath();
      g.arc(64, 64, 58, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#ffffff";
      g.lineWidth = 6;
      g.stroke();
      g.fillStyle = "#ffffff";
      if (kind === "plus") {
        g.fillRect(56, 30, 16, 68);
        g.fillRect(30, 56, 68, 16);
      } else {
        g.lineWidth = 10;
        g.beginPath();
        g.arc(64, 54, 18, Math.PI, 0);
        g.lineTo(82, 64);
        g.moveTo(46, 64);
        g.lineTo(46, 54);
        g.stroke();
        g.beginPath();
        g.roundRect(38, 60, 52, 40, 8);
        g.fill();
        g.fillStyle = "#7a8a99";
        g.beginPath();
        g.arc(64, 78, 6, 0, Math.PI * 2);
        g.fill();
      }
    })
  );

/** Algae smudges for dirty glass. */
export const algaeTexture = () =>
  cached("algae", () =>
    canvasTex(256, 128, (g) => {
      let seed = 7;
      const r = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      for (let i = 0; i < 70; i++) {
        const x = r() * 256;
        const y = 40 + r() * 88;
        const s = 4 + r() * 16;
        const grad = g.createRadialGradient(x, y, 0, x, y, s);
        grad.addColorStop(0, `rgba(70,120,40,${0.5 + r() * 0.4})`);
        grad.addColorStop(1, "rgba(70,120,40,0)");
        g.fillStyle = grad;
        g.fillRect(x - s, y - s, s * 2, s * 2);
      }
    })
  );

/** Diagonal highlights on the glass. */
export const glassTexture = () =>
  cached("glass", () =>
    canvasTex(256, 256, (g) => {
      const streak = g.createLinearGradient(0, 0, 256, 120);
      for (const [stop, alpha] of [[0, 0], [0.29, 0], [0.36, 0.28], [0.43, 0], [1, 0]]) {
        streak.addColorStop(stop, `rgba(255,255,255,${alpha})`);
      }
      g.fillStyle = streak;
      g.fillRect(0, 0, 256, 256);
      for (const x of [0, 256]) {
        const corner = g.createRadialGradient(x, 256, 0, x, 256, 44);
        corner.addColorStop(0, "rgba(24,95,119,0.26)");
        corner.addColorStop(1, "rgba(24,95,119,0)");
        g.fillStyle = corner;
        g.fillRect(0, 0, 256, 256);
      }
      const edges = g.createLinearGradient(0, 0, 256, 0);
      for (const [stop, alpha] of [[0, 0.95], [0.008, 0.7], [0.025, 0.12], [0.045, 0], [0.955, 0], [0.975, 0.12], [0.992, 0.7], [1, 0.95]]) edges.addColorStop(stop, `rgba(239,255,255,${alpha})`);
      g.fillStyle = edges;
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = "rgba(226,255,255,0.65)";
      g.beginPath();
      g.moveTo(2, 7);
      g.lineTo(254, 7);
      g.stroke();
    })
  );

/** Warm painted sand: seeded, seamless patches, quiet grain, sparse pebbles. */
export const sandTexture = () => cached("sand", () => {
  const t = canvasTex(512, 512, (g) => {
    g.fillStyle = "#efd9a7";
    g.fillRect(0, 0, 512, 512);
    let seed = 29;
    const r = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    for (let i = 0; i < 32; i++) {
      const x = r() * 512, y = r() * 512, radius = 25 + r() * 65;
      for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) {
        const patch = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
        patch.addColorStop(0, i % 2 ? "rgba(210,170,106,0.14)" : "rgba(255,247,216,0.3)");
        patch.addColorStop(1, "rgba(239,217,167,0)");
        g.fillStyle = patch;
        g.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
      }
    }
    for (let i = 0; i < 4600; i++) {
      g.fillStyle = i % 2 ? "rgba(167,127,77,0.12)" : "rgba(255,254,235,0.24)";
      g.fillRect(r() * 512, r() * 512, 0.6 + r(), 0.6 + r());
    }
    for (let i = 0; i < 22; i++) {
      const x = 8 + r() * 496, y = 8 + r() * 496;
      g.fillStyle = ["#c8b590", "#d3c5ae", "#f9ebc7"][i % 3];
      g.beginPath(); g.ellipse(x, y, 1.4 + r() * 1.5, 1 + r(), r() * 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(255,250,228,0.6)";
      g.fillRect(x - 0.8, y - 0.8, 1.3, 0.6);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
});

// Patch the existing merged tank shell, including its dune, without adding a
// coplanar sand plane or touching the room model/materials. One shared material.
export const tankShellMaterial = (() => {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSand = { value: sandTexture() };
    shader.uniforms.uTime = shaderTime;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
varying vec3 vTankPos;
varying vec3 vTankUp;`).replace("#include <begin_vertex>", `#include <begin_vertex>
vTankPos = position;
vTankUp = normalMatrix * vec3(0.0, 1.0, 0.0);`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 vTankPos;
varying vec3 vTankUp;
uniform sampler2D uSand;
uniform float uTime;`).replace("#include <color_fragment>", `#include <color_fragment>
// Beige sand only: exclude coloured pebbles, posts, cabinet and filter.
float sand = step(0.749, vTankPos.y) * (1.0 - step(0.94, vTankPos.y))
  * step(vColor.b * 1.35, vColor.r) * step(vColor.r * 0.74, vColor.g);
vec2 sp = vTankPos.xz * 1.8;
vec3 painted = texture2D(uSand, sp).rgb;
float c1 = sin(sp.x * 12.0 + sin(sp.y * 9.0 + uTime * 0.32))
  * sin(sp.y * 11.0 - uTime * 0.25);
float c2 = sin(sp.x * 8.0 - sp.y * 10.0 + uTime * 0.38);
float caustic = smoothstep(0.72, 1.0, c1 * 0.65 + c2 * 0.35);
diffuseColor.rgb = mix(diffuseColor.rgb, painted * (0.88 + caustic * 0.08), sand);`).replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
normal = normalize(mix(normal, normalize(vTankUp), sand * 0.85));`);
  };
  m.customProgramCacheKey = () => "tank-sand-v1";
  return m;
})();

export const floorTexture = () =>
  cached("floor", () => {
    const t = canvasTex(256, 256, (g) => {
      tiles(g, ["#eef6f8", "#dcecf1"], 11, "rgba(150,186,200,0.55)");
      // Small warm-sand corner insets where four tiles meet.
      g.fillStyle = "#f4e3c4";
      for (let y = 0; y <= 4; y++) {
        for (let x = 0; x <= 4; x++) {
          g.beginPath();
          g.moveTo(x * 64, y * 64 - 7);
          g.lineTo(x * 64 + 7, y * 64);
          g.lineTo(x * 64, y * 64 + 7);
          g.lineTo(x * 64 - 7, y * 64);
          g.fill();
        }
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(7, 5);
    return t;
  });

/** 4×4 alternating tiles with a quiet per-tile tone shift, a soft top-left sheen and grout. */
function tiles(g: CanvasRenderingContext2D, colours: [string, string], seed: number, grout: string) {
  const s = 64;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      g.fillStyle = colours[(x + y) % 2];
      g.fillRect(x * s, y * s, s, s);
      const v = r() - 0.5;
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v * 0.22})` : `rgba(40,80,100,${-v * 0.1})`;
      g.fillRect(x * s, y * s, s, s);
      const sheen = g.createLinearGradient(x * s, y * s, x * s + s, y * s + s);
      sheen.addColorStop(0, "rgba(255,255,255,0.22)");
      sheen.addColorStop(0.45, "rgba(255,255,255,0)");
      sheen.addColorStop(1, "rgba(0,40,60,0.05)");
      g.fillStyle = sheen;
      g.fillRect(x * s, y * s, s, s);
    }
  }
  g.strokeStyle = grout;
  g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * s, 0);
    g.lineTo(i * s, 256);
    g.moveTo(0, i * s);
    g.lineTo(256, i * s);
    g.stroke();
  }
}

/** The Ocean Hall's floor: deeper blue tiles. */
export const floor2Texture = () =>
  cached("floor2", () => {
    const t = canvasTex(256, 256, (g) => {
      tiles(g, ["#5fa9cf", "#4f9cc4"], 23, "rgba(22,70,108,0.6)");
      // A pale wave mosaic running across every second tile row.
      g.strokeStyle = "rgba(205,240,252,0.38)";
      g.lineWidth = 3.5;
      g.lineCap = "round";
      for (const y0 of [32, 160]) {
        g.beginPath();
        for (let x = 0; x <= 256; x += 4) {
          const y = y0 + Math.sin((x / 256) * Math.PI * 4) * 9;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 4);
    return t;
  });

/** The Ocean Hall floor: tiles plus a slow, faint caustic shimmer near the tanks (one shader term). */
export const oceanFloorMaterial = (() => {
  let m: THREE.MeshLambertMaterial | null = null;
  return () => {
    if (m) return m;
    m = new THREE.MeshLambertMaterial({ map: floor2Texture() });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = shaderTime;
      shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
varying vec2 vFloorXZ;`).replace("#include <worldpos_vertex>", `#include <worldpos_vertex>
vFloorXZ = (modelMatrix * vec4(transformed, 1.0)).xz;`);
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
uniform float uTime;
varying vec2 vFloorXZ;`).replace("#include <map_fragment>", `#include <map_fragment>
vec2 cp = vFloorXZ * 1.6;
float cw = sin(cp.x * 2.1 + uTime * 0.6 + sin(cp.y * 1.7 + uTime * 0.4)) + sin(cp.y * 2.4 - uTime * 0.5 + sin(cp.x * 1.3 - uTime * 0.3));
float caustic = smoothstep(1.15, 1.85, cw) * (1.0 - smoothstep(-2.5, 1.0, vFloorXZ.y));
diffuseColor.rgb += vec3(0.16, 0.26, 0.3) * caustic;`);
    };
    return m;
  };
})();

/** The Ocean Hall's back wall: the deep sea, with jellyfish and a turtle. */
export const oceanMuralTexture = () =>
  cached("mural2", () =>
    canvasTex(1024, 256, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "#3fa7d6");
      grad.addColorStop(0.6, "#1b5f99");
      grad.addColorStop(1, "#0f3f6e");
      g.fillStyle = grad;
      g.fillRect(0, 0, 1024, 256);
      g.fillStyle = "rgba(255,255,255,0.1)";
      for (let i = 0; i < 6; i++) {
        const x = 90 + i * 170;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + 40, 0);
        g.lineTo(x + 110, 256);
        g.lineTo(x + 30, 256);
        g.closePath();
        g.fill();
      }
      // Jellyfish.
      for (const [x, y, s] of [
        [160, 80, 1],
        [230, 130, 0.7],
        [860, 70, 0.9]
      ]) {
        g.fillStyle = "rgba(220,170,255,0.55)";
        g.beginPath();
        g.arc(x, y, 26 * s, Math.PI, 0);
        g.closePath();
        g.fill();
        g.strokeStyle = "rgba(220,170,255,0.5)";
        g.lineWidth = 3;
        for (let k = -2; k <= 2; k++) {
          g.beginPath();
          g.moveTo(x + k * 9 * s, y);
          g.quadraticCurveTo(x + k * 9 * s + 8, y + 30 * s, x + k * 9 * s, y + 60 * s);
          g.stroke();
        }
      }
      // A turtle.
      g.fillStyle = "rgba(20,70,110,0.5)";
      g.beginPath();
      g.ellipse(560, 110, 70, 40, -0.1, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(640, 102, 18, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(560, 70, 60, 14, -0.6, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(560, 152, 50, 12, 0.6, 0, Math.PI * 2);
      g.fill();
      // Sea floor.
      g.fillStyle = "#0c3358";
      g.beginPath();
      g.moveTo(0, 256);
      for (let x = 0; x <= 1024; x += 32) g.lineTo(x, 236 + Math.sin(x * 0.03) * 8);
      g.lineTo(1024, 256);
      g.closePath();
      g.fill();
    })
  );

/** The back wall: an ocean mural with light rays and silhouettes. */
export const muralTexture = () =>
  cached("mural", () =>
    canvasTex(1024, 256, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "#7fd6ef");
      grad.addColorStop(0.55, "#2f9fcf");
      grad.addColorStop(1, "#1d6ea3");
      g.fillStyle = grad;
      g.fillRect(0, 0, 1024, 256);
      g.fillStyle = "rgba(255,255,255,0.12)";
      for (let i = 0; i < 7; i++) {
        const x = 60 + i * 150;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + 50, 0);
        g.lineTo(x + 120, 256);
        g.lineTo(x + 40, 256);
        g.closePath();
        g.fill();
      }
      // A whale.
      g.fillStyle = "rgba(20,70,120,0.45)";
      g.beginPath();
      g.ellipse(250, 120, 110, 36, -0.05, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(140, 118);
      g.lineTo(95, 88);
      g.lineTo(105, 122);
      g.lineTo(92, 150);
      g.closePath();
      g.fill();
      // A turtle.
      g.beginPath();
      g.ellipse(760, 90, 44, 28, 0.15, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(812, 98, 12, 0, Math.PI * 2);
      g.fill();
      // Small fish.
      for (let i = 0; i < 14; i++) {
        const x = 420 + (i % 7) * 34 + (i > 6 ? 18 : 0);
        const y = 150 + (i > 6 ? 26 : 0) + Math.sin(i) * 8;
        g.beginPath();
        g.ellipse(x, y, 10, 5, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(x - 9, y);
        g.lineTo(x - 17, y - 6);
        g.lineTo(x - 17, y + 6);
        g.closePath();
        g.fill();
      }
      // Sea floor.
      g.fillStyle = "#1a5f8c";
      g.beginPath();
      g.moveTo(0, 256);
      for (let x = 0; x <= 1024; x += 32) g.lineTo(x, 232 + Math.sin(x * 0.02) * 10);
      g.lineTo(1024, 256);
      g.closePath();
      g.fill();
      g.fillStyle = "#2d8a6a";
      for (let x = 30; x < 1024; x += 90) {
        g.beginPath();
        g.ellipse(x, 230, 6, 26, 0.1, 0, Math.PI * 2);
        g.fill();
      }
    })
  );

/** Painted sign text. */
export function signTexture(text: string, bg: string, fg: string, w = 512, h = 128): THREE.CanvasTexture {
  return cached(`sign-${text}-${bg}-${fg}-${w}-${h}`, () =>
    canvasTex(w, h, (g) => {
      g.fillStyle = bg;
      g.beginPath();
      g.roundRect(4, 4, w - 8, h - 8, h * 0.3);
      g.fill();
      g.lineWidth = 6;
      g.strokeStyle = "rgba(255,255,255,0.8)";
      g.stroke();
      g.fillStyle = fg;
      g.font = `900 ${Math.round(h * 0.52)}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, w / 2, h / 2 + 3);
    })
  );
}

/** All rounded canvas signs must preserve the empty corner pixels' alpha. */
export function signMaterial(text: string, bg: string, fg: string, w = 512, h = 128): THREE.MeshBasicMaterial {
  const key = `sign-material-${text}-${bg}-${fg}-${w}-${h}`;
  let material = signMaterials.get(key);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg, w, h), transparent: true, alphaTest: 0.01 });
    signMaterials.set(key, material);
  }
  return material;
}
const signMaterials = new Map<string, THREE.MeshBasicMaterial>();

/** A framed poster of a fish (side walls) or the fish fan's photo. */
export function posterTexture(kind: "clown" | "tang" | "photo"): THREE.CanvasTexture {
  return cached(`poster-${kind}`, () =>
    canvasTex(256, 192, (g) => {
      const bg = g.createLinearGradient(0, 0, 0, 192);
      bg.addColorStop(0, kind === "photo" ? "#9fe6ff" : "#bdf0ff");
      bg.addColorStop(1, kind === "photo" ? "#2f8fc4" : "#58bde0");
      g.fillStyle = bg;
      g.fillRect(0, 0, 256, 192);
      const fish = (x: number, y: number, s: number, body: string, stripe: string | null) => {
        g.fillStyle = body;
        g.beginPath();
        g.ellipse(x, y, 40 * s, 24 * s, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(x - 34 * s, y);
        g.lineTo(x - 62 * s, y - 22 * s);
        g.lineTo(x - 62 * s, y + 22 * s);
        g.closePath();
        g.fill();
        if (stripe) {
          g.fillStyle = stripe;
          g.fillRect(x - 6 * s, y - 22 * s, 9 * s, 44 * s);
          g.fillRect(x + 18 * s, y - 17 * s, 7 * s, 34 * s);
        }
        g.fillStyle = "#fff";
        g.beginPath();
        g.arc(x + 26 * s, y - 6 * s, 7 * s, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#123";
        g.beginPath();
        g.arc(x + 28 * s, y - 6 * s, 4 * s, 0, Math.PI * 2);
        g.fill();
      };
      if (kind === "clown") fish(140, 96, 1.4, "#ff7a1a", "#ffffff");
      else if (kind === "tang") fish(140, 96, 1.4, "#2f6fe8", null);
      else {
        fish(100, 80, 0.9, "#ff7a1a", "#ffffff");
        fish(170, 120, 1, "#2f6fe8", null);
        g.fillStyle = "#ffd23f";
        g.font = "900 34px system-ui, sans-serif";
        g.fillText("★", 196, 46);
      }
      g.strokeStyle = "#ffffff";
      g.lineWidth = 10;
      g.strokeRect(5, 5, 246, 182);
    })
  );
}

// ------------------------------------------------------------------ shaders

/** The inside of a tank (rendered from inside: back, sides and floor). */
export function waterMaterial(h: number): THREE.ShaderMaterial & { uniforms: { uDirt: { value: number } } } {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uTime: shaderTime, uDirt: { value: 0 }, uH: { value: h } },
    vertexShader: `
      varying vec3 vPos;
      varying vec3 vN;
      void main() {
        vPos = position;
        vN = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uDirt;
      uniform float uH;
      varying vec3 vPos;
      varying vec3 vN;
      void main() {
        float t = clamp((vPos.y + uH * 0.5) / uH, 0.0, 1.0);
        // These are display-space colours, matching the original water shader.
        vec3 deep = vec3(0.035, 0.29, 0.53);
        vec3 top = vec3(0.30, 0.81, 0.94);
        vec3 col = mix(deep, top, smoothstep(0.0, 1.0, t));
        vec2 p = abs(vN.z) > 0.5 ? vPos.xy : vPos.zy;
        p *= 7.0;
        float c = sin(p.x * 1.7 + uTime * 1.1) * sin(p.y * 2.3 - uTime * 0.9) + 0.6 * sin((p.x + p.y) * 2.9 + uTime * 1.4);
        col += smoothstep(0.7, 1.4, c) * 0.16 * (0.4 + t) * (1.0 - uDirt * 0.7);
        col = mix(col, vec3(0.33, 0.43, 0.16), uDirt * 0.8);
        gl_FragColor = vec4(col, 1.0);
      }`
  }) as THREE.ShaderMaterial & { uniforms: { uDirt: { value: number } } };
}

/** The water surface seen from above: soft ripples. */
export function surfaceMaterial(): THREE.ShaderMaterial & { uniforms: { uDirt: { value: number } } } {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: shaderTime, uDirt: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uDirt;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * vec2(9.0, 5.0);
        float r = sin(p.x * 2.1 + uTime * 1.6) * sin(p.y * 2.7 - uTime * 1.2) + 0.5 * sin((p.x - p.y) * 3.3 + uTime * 2.0);
        float hi = smoothstep(0.8, 1.4, r);
        float edge = 1.0 - smoothstep(0.0, 0.025, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
        vec3 col = mix(vec3(0.50, 0.89, 0.98), vec3(0.38, 0.52, 0.23), uDirt * 0.7) + hi * 0.22 + edge * 0.14;
        gl_FragColor = vec4(col, 0.30 + hi * 0.18 + edge * 0.18);
      }`
  }) as THREE.ShaderMaterial & { uniforms: { uDirt: { value: number } } };
}

export interface FishMaterial extends THREE.MeshLambertMaterial {
  userData: { uPhase: { value: number }; uAmp: { value: number }; uLen: { value: number } };
}

/**
 * A fish's own material: the body bends in a travelling wave toward the tail
 * (vertex shader), so one mesh per fish swims smoothly. All fish share one
 * compiled program; the uniforms are per fish.
 */
export function fishMaterial(length: number, species: SpeciesId = "clownfish"): FishMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true }) as FishMaterial;
  m.userData = { uPhase: { value: 0 }, uAmp: { value: 0.3 }, uLen: { value: length } };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPhase = m.userData.uPhase;
    shader.uniforms.uAmp = m.userData.uAmp;
    shader.uniforms.uLen = m.userData.uLen;
    shader.uniforms.uSpecies = { value: ["clownfish", "bluetang", "yellowfish", "pufferfish", "turtle", "seahorse", "jellyfish"].indexOf(species) };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uPhase;
uniform float uAmp;
uniform float uLen;
varying vec3 vFishPos;
varying vec3 vFishNormal;
varying vec2 vFishUv;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vFishPos = position / uLen;
vFishNormal = normal;
vFishUv = uv;
float bt = clamp((uLen * 0.22 - transformed.x) / uLen, 0.0, 1.3);
transformed.z += sin(uPhase - bt * 2.6) * uAmp * bt * bt * uLen;`
      );
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
uniform float uSpecies;
varying vec3 vFishPos;
varying vec3 vFishNormal;
varying vec2 vFishUv;`).replace("#include <color_fragment>", `#include <color_fragment>
vec3 fp = vFishPos;
float chroma = max(vColor.r, max(vColor.g, vColor.b)) - min(vColor.r, min(vColor.g, vColor.b));
float colourMask = smoothstep(0.03, 0.18, chroma);
float brightMask = smoothstep(0.06, 0.3, max(vColor.r, max(vColor.g, vColor.b)));
float belly = 1.0 - smoothstep(-0.23, 0.12, fp.y);
diffuseColor.rgb *= mix(0.76, 1.12, belly * brightMask);
vec3 bellyColour = uSpecies == 1.0 ? vec3(0.22, 0.52, 1.0) : vec3(1.0, 0.86, 0.58);
diffuseColor.rgb = mix(diffuseColor.rgb, bellyColour, belly * colourMask * brightMask * 0.40);
if (uSpecies == 0.0) {
  // Continuous bands avoid the pinched, intersecting ellipsoid band surfaces.
  float body = step(fp.x * fp.x / 0.25 + fp.y * fp.y / 0.073 + fp.z * fp.z / 0.033, 1.08);
  float band = min(abs(fp.x - 0.15) - 0.04, min(abs(fp.x + 0.04) - 0.05, abs(fp.x + 0.33) - 0.035));
  float outline = 1.0 - smoothstep(0.012, 0.018, band);
  float white = 1.0 - smoothstep(-0.003, 0.002, band);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.012, 0.016, 0.024), vec3(1.0), white), body * outline);
}
if (uSpecies == 2.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.40, 0.025), smoothstep(-0.1, 0.38, fp.y) * colourMask * 0.32);
// Thin fins and tail catch soft light at the edges, while keeping dark rims.
float fin = max(smoothstep(0.27, 0.36, abs(fp.y)), 1.0 - smoothstep(-0.56, -0.42, fp.x));
float finEdge = 0.3 + 0.7 * pow(1.0 - abs(normalize(vFishNormal).z), 0.7);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.92, 0.65), fin * finEdge * colourMask * brightMask * 0.65);
if (uSpecies == 1.0) {
  // A solid palette from behind the eye, sweeping down into the tail base (an
  // inner blue loop read as a grey ring at gameplay scale).
  float palette = 1.0 - smoothstep(0.8, 1.0, length((fp.xy - vec2(-0.06, 0.13)) / vec2(0.28, 0.085)));
  palette = max(palette, 1.0 - smoothstep(0.8, 1.0, length((fp.xy - vec2(-0.34, 0.06)) / vec2(0.11, 0.07))));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.008, 0.018, 0.065), palette);
  // A very quiet scale hint on the larger tang only; never on its dark palette.
  vec2 scaleUv = fp.xy * vec2(24.0, 28.0);
  scaleUv.x += mod(floor(scaleUv.y), 2.0) * 0.5;
  float scales = smoothstep(0.39, 0.47, length(fract(scaleUv) - 0.5));
  diffuseColor.rgb *= 1.0 - scales * 0.035 * colourMask * (1.0 - fin);
}
if (uSpecies == 3.0) {
  vec2 spots = fp.xy * 13.0;
  spots.x += sin(floor(spots.y) * 3.7) * 0.8;
  float dot = 1.0 - smoothstep(0.10, 0.19, length(fract(spots) - 0.5));
  diffuseColor.rgb *= 1.0 - dot * smoothstep(-0.03, 0.20, fp.y) * 0.38;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.94, 0.73), belly * brightMask * 0.6);
}
if (uSpecies == 4.0) {
  float shell = (1.0 - step(0.4, abs(fp.x))) * step(0.04, fp.y) * step(vColor.r * 1.15, vColor.g);
  vec2 plate = fp.xz * vec2(6.0, 7.0);
  plate.x += mod(floor(plate.y), 2.0) * 0.5;
  vec2 edge = abs(fract(plate) - 0.5);
  float seam = smoothstep(0.35, 0.46, max(edge.x, edge.y));
  diffuseColor.rgb *= 1.0 - shell * seam * 0.65;
  diffuseColor.rgb += shell * (1.0 - seam) * vec3(0.10, 0.26, 0.045);
}
if (uSpecies == 5.0) {
  float ridge = pow(0.5 + 0.5 * sin(fp.y * 85.0 + fp.x * 24.0), 3.0);
  diffuseColor.rgb *= 1.0 - ridge * 0.42 * colourMask;
  diffuseColor.rgb += vec3(0.08, 0.035, 0.035) * smoothstep(-0.4, 0.45, fp.y) * colourMask;
}
if (uSpecies == 6.0) {
  float bell = smoothstep(-0.12, 0.04, fp.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.39, 0.95), bell * 0.22);
  diffuseColor.rgb += vec3(0.48, 0.22, 0.55) * bell * (1.0 - smoothstep(0.0, 0.40, length(fp.xz)));
  diffuseColor.a *= mix(0.78, 1.0, smoothstep(0.0, 0.42, length(fp.xz)));
}
// Existing dark eye spheres get a crisp white catchlight in their UV space.
float eye = (1.0 - smoothstep(0.025, 0.1, max(vColor.r, max(vColor.g, vColor.b)))) * step(0.2, fp.x);
float catchlight = 1.0 - smoothstep(0.10, 0.16, length(vFishUv - vec2(0.33, 0.32)));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), eye * catchlight);
`).replace("#include <opaque_fragment>", `
vec3 viewDir = normalize(vViewPosition);
float rim = pow(1.0 - abs(dot(normal, viewDir)), 3.0);
float wet = pow(max(dot(normal, normalize(viewDir + vec3(-0.4, 0.8, 0.6))), 0.0), 18.0);
// From the painted colour, so dark markings (tang palette, band outlines) stay dark.
float litColour = smoothstep(0.035, 0.18, max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)));
outgoingLight += (vec3(0.19, 0.28, 0.34) * rim + vec3(0.28, 0.27, 0.25) * wet) * litColour;
if (uSpecies == 6.0) outgoingLight += vec3(0.13, 0.07, 0.2) * rim;
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => "fish-painted-v2";
  return m;
}

/** Plants sway: the top moves, the base stays planted (object-space height). */
export const swayMat = (() => {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shaderTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uTime;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
float sw = max(transformed.y, 0.0);
float ph = modelMatrix[3].x * 3.1 + modelMatrix[3].z * 1.7;
transformed.x += sin(uTime * 1.3 + ph + transformed.y * 4.0) * 0.18 * sw * sw;
transformed.z += cos(uTime * 1.1 + ph) * 0.08 * sw * sw;`
      );
  };
  m.customProgramCacheKey = () => "plant-sway-v1";
  return m;
})();
