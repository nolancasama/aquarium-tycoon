import * as THREE from "three";

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
    canvasTex(256, 128, (g) => {
      g.fillStyle = "rgba(255,255,255,0)";
      g.fillRect(0, 0, 256, 128);
      g.fillStyle = "rgba(255,255,255,0.55)";
      for (const [x, w] of [
        [40, 14],
        [64, 5],
        [190, 9]
      ]) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + w, 0);
        g.lineTo(x + w - 40, 128);
        g.lineTo(x - 40, 128);
        g.closePath();
        g.fill();
      }
    })
  );

export const floorTexture = () =>
  cached("floor", () => {
    const t = canvasTex(256, 256, (g) => {
      const s = 64;
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          g.fillStyle = (x + y) % 2 ? "#e9f3f6" : "#d6e9ef";
          g.fillRect(x * s, y * s, s, s);
        }
      }
      g.strokeStyle = "rgba(120,160,180,0.35)";
      g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        g.beginPath();
        g.moveTo(i * s, 0);
        g.lineTo(i * s, 256);
        g.moveTo(0, i * s);
        g.lineTo(256, i * s);
        g.stroke();
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(7, 5);
    return t;
  });

/** The Ocean Hall's floor: deeper blue tiles. */
export const floor2Texture = () =>
  cached("floor2", () => {
    const t = canvasTex(256, 256, (g) => {
      const s = 64;
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          g.fillStyle = (x + y) % 2 ? "#cfe8f4" : "#b9dcee";
          g.fillRect(x * s, y * s, s, s);
        }
      }
      g.strokeStyle = "rgba(60,120,160,0.35)";
      g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        g.beginPath();
        g.moveTo(i * s, 0);
        g.lineTo(i * s, 256);
        g.moveTo(0, i * s);
        g.lineTo(256, i * s);
        g.stroke();
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 4);
    return t;
  });

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
  return cached(`sign-${text}-${bg}-${fg}-${w}`, () =>
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
        vec3 deep = vec3(0.05, 0.36, 0.58);
        vec3 top = vec3(0.36, 0.83, 0.93);
        vec3 col = mix(deep, top, smoothstep(0.0, 1.0, t));
        vec2 p = abs(vN.z) > 0.5 ? vPos.xy : vPos.zy;
        p *= 7.0;
        float c = sin(p.x * 1.7 + uTime * 1.1) * sin(p.y * 2.3 - uTime * 0.9) + 0.6 * sin((p.x + p.y) * 2.9 + uTime * 1.4);
        col += smoothstep(0.7, 1.4, c) * 0.16 * (0.4 + t);
        col = mix(col, vec3(0.38, 0.47, 0.25), uDirt * 0.6);
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
        float hi = smoothstep(0.5, 1.3, r);
        vec3 col = mix(vec3(0.62, 0.92, 0.98), vec3(0.55, 0.62, 0.35), uDirt * 0.6) + hi * 0.25;
        gl_FragColor = vec4(col, 0.42 + hi * 0.25);
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
export function fishMaterial(length: number): FishMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true }) as FishMaterial;
  m.userData = { uPhase: { value: 0 }, uAmp: { value: 0.3 }, uLen: { value: length } };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPhase = m.userData.uPhase;
    shader.uniforms.uAmp = m.userData.uAmp;
    shader.uniforms.uLen = m.userData.uLen;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uPhase;
uniform float uAmp;
uniform float uLen;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
float bt = clamp((uLen * 0.22 - transformed.x) / uLen, 0.0, 1.3);
transformed.z += sin(uPhase - bt * 2.6) * uAmp * bt * bt * uLen;`
      );
  };
  m.customProgramCacheKey = () => "fish-bend-v1";
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
