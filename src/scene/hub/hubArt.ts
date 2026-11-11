import * as THREE from "three";
import type { HubDestination } from "../../game/data/hub";

/**
 * Painted canvases for the Grand Hub: the floor mosaic, each doorway's view of
 * its wing (the picture that tells a child where the door goes), the window
 * view and the directory board. Drawn once, no downloads.
 */

const cache = new Map<string, THREE.CanvasTexture>();
function tex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  let t = cache.get(key);
  if (!t) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d")!);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    cache.set(key, t);
  }
  return t;
}

let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/** Floor: warm terrazzo, a compass-rose mosaic under the tank, a wave band, plaza tiles in front. */
export function hubFloorTexture(wM: number, dM: number, centreU: number, centreV: number, rM: number) {
  const W = 1024, H = Math.round((1024 * dM) / wM), px = W / wM;
  return tex(`hub-floor-${wM}-${dM}`, W, H, (g) => {
    g.fillStyle = "#efe4d0";
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = ["#d8c9ae", "#f8f1e2", "#c9d8d4", "#e2cfae"][i % 4];
      g.fillRect(rnd() * W, rnd() * H, 2, 2);
    }
    // Plaza tiles toward the front.
    g.strokeStyle = "rgba(150,130,100,0.25)";
    g.lineWidth = 2;
    const tile = 1.5 * px;
    for (let x = 0; x < W; x += tile) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += tile) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const cx = centreU * W, cy = centreV * H;
    // Rotunda inlay: a pale disc over the tiles.
    g.fillStyle = "#f3ead8";
    g.beginPath(); g.arc(cx, cy, (rM - 0.3) * px, 0, Math.PI * 2); g.fill();
    const ring = (r: number, w: number, c: string) => { g.strokeStyle = c; g.lineWidth = w * px; g.beginPath(); g.arc(cx, cy, r * px, 0, Math.PI * 2); g.stroke(); };
    ring(rM - 0.5, 0.18, "#1f8a9a");
    ring(rM - 0.85, 0.06, "#d9a441");
    // Wave band.
    g.strokeStyle = "#5fc0cf";
    g.lineWidth = 0.1 * px;
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.02) {
      const r = (rM - 1.35 + Math.sin(a * 28) * 0.12) * px;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    // Compass star round the tank.
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, long = k % 2 === 0;
      const r0 = 2.7 * px, r1 = (long ? 5.6 : 4.4) * px, half = (long ? 0.22 : 0.16);
      g.fillStyle = k % 4 === 0 ? "#1f8a9a" : long ? "#5fc0cf" : "#e8c06a";
      g.beginPath();
      g.moveTo(cx + Math.cos(a - half) * r0, cy + Math.sin(a - half) * r0);
      g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.lineTo(cx + Math.cos(a + half) * r0, cy + Math.sin(a + half) * r0);
      g.closePath();
      g.fill();
    }
    ring(2.7, 0.12, "#d9a441");
  });
}

function sky(g: CanvasRenderingContext2D, w: number, h: number, top: string, bottom: string) {
  const s = g.createLinearGradient(0, 0, 0, h);
  s.addColorStop(0, top);
  s.addColorStop(1, bottom);
  g.fillStyle = s;
  g.fillRect(0, 0, w, h);
}

function fishShape(g: CanvasRenderingContext2D, x: number, y: number, s: number, c: string, flip = false) {
  g.save();
  g.translate(x, y);
  if (flip) g.scale(-1, 1);
  g.fillStyle = c;
  g.beginPath();
  g.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(-s * 0.8, 0); g.lineTo(-s * 1.5, -s * 0.5); g.lineTo(-s * 1.5, s * 0.5); g.closePath();
  g.fill();
  g.restore();
}

function penguin(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.fillStyle = "#1d2330";
  g.beginPath(); g.ellipse(x, y, s * 0.5, s, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(x, y - s * 1.05, s * 0.38, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#ffffff";
  g.beginPath(); g.ellipse(x + s * 0.06, y + s * 0.08, s * 0.32, s * 0.78, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#ffb52e";
  g.beginPath(); g.moveTo(x + s * 0.3, y - s * 1.08); g.lineTo(x + s * 0.62, y - s * 1.0); g.lineTo(x + s * 0.3, y - s * 0.95); g.fill();
  g.fillRect(x - s * 0.3, y + s * 0.92, s * 0.25, s * 0.1);
  g.fillRect(x + s * 0.06, y + s * 0.92, s * 0.25, s * 0.1);
}

/** A bottlenose dolphin side view, nose to +x, centred at (0,0), length s. */
function dolphinShape(g: CanvasRenderingContext2D, x: number, y: number, s: number, angle: number) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.scale(s / 200, s / 200);
  const body = new Path2D("M100 0 C92 -8 80 -12 66 -16 C40 -26 0 -28 -40 -20 C-70 -14 -86 -6 -100 0 C-86 6 -66 14 -40 18 C0 24 40 22 66 14 C80 10 90 6 100 2 Z");
  g.fillStyle = "#7f98a8";
  g.fill(body);
  g.save();
  g.clip(body);
  g.fillStyle = "#e7eef2";
  g.beginPath(); g.ellipse(10, 18, 90, 16, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  g.fillStyle = "#6b8495";
  g.beginPath(); g.moveTo(-6, -24); g.quadraticCurveTo(-2, -58, -30, -66); g.quadraticCurveTo(-18, -40, -34, -22); g.fill();
  g.beginPath(); g.moveTo(-96, 0); g.lineTo(-128, -18); g.quadraticCurveTo(-118, 0, -128, 18); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(30, 12); g.quadraticCurveTo(20, 34, 4, 36); g.quadraticCurveTo(14, 22, 14, 12); g.fill();
  g.fillStyle = "#1d2a33"; g.beginPath(); g.arc(70, -4, 3.6, 0, Math.PI * 2); g.fill();
  g.restore();
}

/** An orca side view with its markings, nose to +x. `fin` scales the dorsal fin (tall for a male). */
function orcaShape(g: CanvasRenderingContext2D, x: number, y: number, s: number, angle: number, fin = 1) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.scale(s / 200, s / 200);
  const body = new Path2D("M100 2 C98 -14 84 -26 60 -30 C20 -36 -30 -34 -64 -22 C-82 -14 -94 -6 -100 0 C-90 8 -70 16 -40 22 C0 30 50 30 80 20 C94 14 100 10 100 2 Z");
  g.fillStyle = "#151c24";
  g.fill(body);
  g.save();
  g.clip(body);
  g.fillStyle = "#f4f6f8";
  g.beginPath(); g.ellipse(40, 26, 64, 12, 0.05, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(-30, 18, 30, 12, -0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(58, -12, 13, 6, -0.25, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#9aa3ab";
  g.beginPath(); g.ellipse(-24, -30, 22, 6, 0.1, 0, Math.PI * 2); g.fill();
  g.restore();
  g.fillStyle = "#151c24";
  g.beginPath(); g.moveTo(-6, -32); g.quadraticCurveTo(0, -32 - 70 * fin, -14 - 6 * (2 - fin), -34 - 78 * fin); g.quadraticCurveTo(-18, -60, -30, -28); g.fill();
  g.beginPath(); g.moveTo(-96, 0); g.lineTo(-130, -20); g.quadraticCurveTo(-118, 0, -130, 20); g.closePath(); g.fill();
  g.beginPath(); g.ellipse(36, 24, 16, 8, 0.6, 0, Math.PI * 2); g.fill();
  g.restore();
}

function palm(g: CanvasRenderingContext2D, x: number, y: number, h: number) {
  g.strokeStyle = "#8a6440"; g.lineWidth = h * 0.06;
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + h * 0.25, y - h * 0.5, x + h * 0.1, y - h); g.stroke();
  g.fillStyle = "#3e9e5a";
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + (k - 2.5) * 0.55;
    g.beginPath();
    g.ellipse(x + h * 0.1 + Math.cos(a) * h * 0.28, y - h + Math.sin(a) * h * 0.12 + h * 0.06, h * 0.3, h * 0.06, a, 0, Math.PI * 2);
    g.fill();
  }
}

function cloud(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.fillStyle = "rgba(255,255,255,0.9)";
  for (const [dx, dy, r] of [[0, 0, 1], [0.9, 0.15, 0.75], [-0.85, 0.2, 0.7], [0.3, -0.45, 0.65]]) {
    g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); g.fill();
  }
}

/** What each doorway shows beyond it (512 × 680, portrait like the opening). `soon`: held back by a release lock. */
export function doorArtTexture(kind: HubDestination, open: boolean, soon = false) {
  return tex(`hub-door-${kind}-${open}-${soon}`, 512, 680, (g) => {
    const W = 512, H = 680;
    if (kind === "indoor") {
      sky(g, W, H, "#fdf3df", "#e8d4b4");
      g.fillStyle = "#cfb38a"; g.fillRect(0, H * 0.72, W, H * 0.28);
      for (let i = 0; i < 3; i++) {
        const x = 40 + i * 160, y = 250 + (i === 1 ? -30 : 0);
        g.fillStyle = "#3c6f86"; g.fillRect(x - 6, y - 6, 132, 172);
        const water = g.createLinearGradient(0, y, 0, y + 160);
        water.addColorStop(0, "#7fe0f5"); water.addColorStop(1, "#1f8fb8");
        g.fillStyle = water; g.fillRect(x, y, 120, 160);
        fishShape(g, x + 40, y + 60, 16, "#ff8a2a");
        fishShape(g, x + 82, y + 105, 12, "#ffd43b", true);
        fishShape(g, x + 50, y + 130, 10, "#4dabf7");
        g.fillStyle = "#6d5537"; g.fillRect(x - 6, y + 166, 132, 120);
      }
    } else if (kind === "sharks") {
      sky(g, W, H, "#1e7f9e", "#062a3d");
      g.strokeStyle = "rgba(180,240,255,0.55)"; g.lineWidth = 14;
      g.beginPath(); g.arc(W / 2, H * 0.95, 230, Math.PI, 0); g.stroke();
      g.fillStyle = "#3a5566";
      g.beginPath();
      g.moveTo(90, 260); g.quadraticCurveTo(250, 200, 410, 250); g.lineTo(450, 220); g.lineTo(440, 285);
      g.quadraticCurveTo(260, 330, 90, 260); g.fill();
      g.beginPath(); g.moveTo(240, 225); g.lineTo(280, 150); g.lineTo(300, 230); g.fill();
      g.fillStyle = "#e9f2f5";
      g.beginPath(); g.moveTo(110, 268); g.quadraticCurveTo(250, 310, 400, 270); g.quadraticCurveTo(250, 300, 110, 268); g.fill();
      fishShape(g, 150, 470, 18, "#9fd8e6");
      fishShape(g, 360, 420, 14, "#9fd8e6", true);
    } else if (kind === "coast") {
      sky(g, W, H, "#bfe9ff", "#e9f7ff");
      g.fillStyle = "#2a8fb6"; g.fillRect(0, H * 0.55, W, H * 0.45);
      g.fillStyle = "#1c6f95"; g.fillRect(0, H * 0.78, W, H * 0.22);
      g.fillStyle = "#f4fbff";
      g.beginPath(); g.moveTo(0, H * 0.6); g.lineTo(120, H * 0.42); g.lineTo(260, H * 0.5); g.lineTo(300, H * 0.6); g.closePath(); g.fill();
      g.fillStyle = "#8c9aa6";
      g.beginPath(); g.moveTo(280, H * 0.62); g.lineTo(380, H * 0.47); g.lineTo(512, H * 0.52); g.lineTo(512, H * 0.66); g.closePath(); g.fill();
      penguin(g, 90, H * 0.5, 36);
      penguin(g, 170, H * 0.47, 30);
      g.fillStyle = "#6b4f3a";
      g.beginPath(); g.ellipse(410, H * 0.72, 60, 18, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(462, H * 0.69, 16, 0, Math.PI * 2); g.fill();
    } else if (kind === "lagoon") {
      // A sunny lagoon: open sky, the sea beyond a rocky breakwater, a deck, a palm and dolphins.
      sky(g, W, H, "#45b4f0", "#d9f3ff");
      const sun = g.createRadialGradient(400, 110, 10, 400, 110, 120);
      sun.addColorStop(0, "rgba(255,248,200,1)"); sun.addColorStop(0.35, "rgba(255,236,150,0.85)"); sun.addColorStop(1, "rgba(255,236,150,0)");
      g.fillStyle = sun; g.fillRect(260, 0, 252, 260);
      cloud(g, 110, 120, 26); cloud(g, 300, 200, 18);
      g.fillStyle = "#8fb4c8";
      g.beginPath(); g.moveTo(0, H * 0.47); g.quadraticCurveTo(90, H * 0.41, 190, H * 0.47); g.closePath(); g.fill();
      g.fillStyle = "#1d7fb5"; g.fillRect(0, H * 0.47, W, H * 0.07);
      g.fillStyle = "#6d7a80";
      for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(30 + i * 58, H * 0.545, 34, 12, 0, 0, Math.PI * 2); g.fill(); }
      const lag = g.createLinearGradient(0, H * 0.55, 0, H);
      lag.addColorStop(0, "#2ec4d6"); lag.addColorStop(1, "#0f8fae");
      g.fillStyle = lag; g.fillRect(0, H * 0.55, W, H * 0.45);
      g.strokeStyle = "rgba(255,255,255,0.45)"; g.lineWidth = 3;
      for (let i = 0; i < 10; i++) {
        const y = H * 0.6 + i * 26, x = (i * 97) % 420;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 22, y - 6, x + 44, y); g.stroke();
      }
      dolphinShape(g, 250, 330, 230, -0.55);
      g.fillStyle = "rgba(255,255,255,0.85)";
      for (const [x, y, r] of [[160, 420, 10], [176, 412, 7], [146, 410, 6], [330, 440, 8], [345, 432, 5]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
      g.save(); g.beginPath(); g.rect(0, 0, W, H * 0.66); g.clip(); dolphinShape(g, 380, H * 0.67, 150, 0.12); g.restore();
      g.fillStyle = "#9c6b3f"; g.fillRect(0, H * 0.8, 200, 24);
      g.fillStyle = "#b8834f"; for (let i = 0; i < 8; i++) g.fillRect(i * 25, H * 0.8, 20, 24);
      g.fillStyle = "#6e4a2a"; for (let i = 0; i < 5; i++) g.fillRect(8 + i * 45, H * 0.72, 7, H * 0.08);
      g.fillRect(0, H * 0.72, 210, 6);
      palm(g, 455, H * 0.82, 260);
    } else {
      // The sanctuary: a vast bay at golden hour, headlands and islands, orcas surfacing.
      sky(g, W, H, "#5da9df", "#ffe0a8");
      const sun = g.createRadialGradient(130, H * 0.42, 10, 130, H * 0.42, 150);
      sun.addColorStop(0, "rgba(255,240,190,1)"); sun.addColorStop(1, "rgba(255,220,150,0)");
      g.fillStyle = sun; g.fillRect(0, H * 0.2, 300, 300);
      g.fillStyle = "#9db3c4";
      g.beginPath(); g.moveTo(0, H * 0.5); g.lineTo(60, H * 0.38); g.lineTo(150, H * 0.44); g.lineTo(240, H * 0.33); g.lineTo(340, H * 0.43); g.lineTo(430, H * 0.36); g.lineTo(512, H * 0.42); g.lineTo(512, H * 0.5); g.closePath(); g.fill();
      g.fillStyle = "#5e7a6c";
      g.beginPath(); g.moveTo(330, H * 0.5); g.quadraticCurveTo(420, H * 0.36, 512, H * 0.4); g.lineTo(512, H * 0.56); g.closePath(); g.fill();
      for (let i = 0; i < 7; i++) { g.fillStyle = "#3f5e4e"; g.beginPath(); g.moveTo(380 + i * 18, H * 0.43 + (i % 2) * 6); g.lineTo(388 + i * 18, H * 0.38 + (i % 2) * 6); g.lineTo(396 + i * 18, H * 0.43 + (i % 2) * 6); g.fill(); }
      const sea = g.createLinearGradient(0, H * 0.5, 0, H);
      sea.addColorStop(0, "#3f7fa6"); sea.addColorStop(1, "#173f5c");
      g.fillStyle = sea; g.fillRect(0, H * 0.5, W, H * 0.5);
      g.fillStyle = "rgba(255,226,160,0.5)";
      for (let i = 0; i < 9; i++) g.fillRect(110 - i * 4, H * 0.52 + i * 18, 40 + i * 8, 4);
      g.fillStyle = "#e7e1d3"; g.fillRect(452, H * 0.3, 14, 70); g.fillStyle = "#c0392b"; g.fillRect(452, H * 0.3 - 14, 14, 14);
      g.save(); g.beginPath(); g.rect(0, 0, W, H * 0.66); g.clip(); orcaShape(g, 270, H * 0.68, 300, -0.12, 1.25); g.restore();
      g.save(); g.beginPath(); g.rect(0, 0, W, H * 0.77); g.clip(); orcaShape(g, 120, H * 0.785, 170, -0.08, 0.75); g.restore();
      g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 4;
      for (const [x, y, w] of [[180, H * 0.665, 180], [60, H * 0.775, 120]]) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 8, x + w, y); g.stroke(); }
      g.fillStyle = "rgba(255,255,255,0.75)"; g.beginPath(); g.ellipse(340, H * 0.58, 10, 26, 0.2, 0, Math.PI * 2); g.fill();
    }
    if (!open && !soon) {
      g.fillStyle = "rgba(20,40,60,0.38)";
      g.fillRect(0, 0, W, H);
    }
    // Soft arch vignette so the picture reads as a view through a doorway.
    const v = g.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 420);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.35)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
    if (soon) {
      // A ribbon across the lower doorway, bilingual, under the floating lock.
      g.save();
      g.translate(W / 2, H * 0.84);
      g.rotate(-0.08);
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(-226, -42, 460, 96);
      g.fillStyle = "#ffcf3f";
      g.fillRect(-232, -48, 464, 96);
      g.fillStyle = "#c98a00";
      g.fillRect(-232, -48, 464, 6);
      g.fillRect(-232, 42, 464, 6);
      g.fillStyle = "#3b2a00";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = "900 42px system-ui, sans-serif";
      g.fillText("COMING SOON", 0, -12);
      g.font = "800 26px system-ui, sans-serif";
      g.fillText("もうすぐ オープン！", 0, 26);
      g.restore();
    }
  });
}

/** The tall rear windows: open sky over the coast, where the outdoor attractions will be. */
export function hubWindowTexture() {
  return tex("hub-window", 512, 768, (g) => {
    sky(g, 512, 768, "#8fd6ff", "#e9f8ff");
    g.fillStyle = "rgba(255,255,255,0.85)";
    for (const [x, y, s] of [[110, 160, 50], [360, 230, 38], [250, 110, 30]]) {
      g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.arc(x + s, y + 8, s * 0.8, 0, Math.PI * 2); g.arc(x - s, y + 10, s * 0.7, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = "#38b2cf"; g.fillRect(0, 560, 512, 208);
    g.fillStyle = "#65c96f";
    g.beginPath(); g.moveTo(0, 580); g.quadraticCurveTo(140, 500, 280, 575); g.lineTo(0, 600); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = 4;
    for (let y = 600; y < 768; y += 34) { g.beginPath(); g.moveTo(40, y); g.lineTo(200, y); g.moveTo(290, y + 14); g.lineTo(470, y + 14); g.stroke(); }
  });
}

/** Static distant coast on a broad card, several metres beyond the real opening. */
export function hubCoastalExteriorTexture() {
  return tex("hub-coastal-exterior", 1536, 1024, g => {
    sky(g, 1536, 1024, "#459ed6", "#d9f3fa");
    const horizon = 563;
    const water = g.createLinearGradient(0, horizon, 0, 1024);
    water.addColorStop(0, "#4aafc9"); water.addColorStop(1, "#147e9f");
    g.fillStyle = water; g.fillRect(0, horizon, 1536, 1024 - horizon);
    g.fillStyle = "#92bcc2";
    g.beginPath(); g.moveTo(450, horizon); g.quadraticCurveTo(510, 520, 600, 550); g.quadraticCurveTo(650, 533, 720, horizon); g.closePath(); g.fill();
    g.fillStyle = "#537f83";
    g.beginPath(); g.moveTo(850, horizon + 30); g.lineTo(920, 535); g.lineTo(980, 500); g.lineTo(1040, 490); g.lineTo(1140, 470); g.lineTo(1536, 477); g.lineTo(1536, 640); g.closePath(); g.fill();
    g.fillStyle = "#6e9a82";
    g.beginPath(); g.moveTo(940, 540); g.lineTo(1000, 505); g.lineTo(1120, 482); g.lineTo(1536, 490); g.lineTo(1536, 550); g.closePath(); g.fill();
    g.fillStyle = "#f8f1d9"; g.fillRect(1033, 431, 17, 61);
    g.fillStyle = "#cc694a"; g.fillRect(1030, 424, 23, 10);
    g.fillStyle = "#345b6d"; g.fillRect(1036, 415, 11, 10);
    g.beginPath(); g.moveTo(1028, 415); g.lineTo(1041, 404); g.lineTo(1055, 415); g.closePath(); g.fill();
    for (const [x, y, s] of [[670, 593, 1], [1000, 626, 0.7]]) {
      g.fillStyle = "#395e70"; g.beginPath(); g.moveTo(x - 16 * s, y); g.lineTo(x + 17 * s, y); g.lineTo(x + 10 * s, y + 7 * s); g.lineTo(x - 10 * s, y + 7 * s); g.closePath(); g.fill();
      g.strokeStyle = "#496b78"; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 35 * s); g.stroke();
      g.fillStyle = "#fff7e6"; g.beginPath(); g.moveTo(x - 3 * s, y - 31 * s); g.lineTo(x - 3 * s, y - 4 * s); g.lineTo(x - 22 * s, y - 4 * s); g.closePath(); g.fill();
    }
    g.strokeStyle = "#90d7e2"; g.lineWidth = 3;
    for (let i = 0; i < 28; i++) { const x = (i * 197) % 1500, y = horizon + 35 + (i * 47) % 400; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 35 + i % 4 * 8, y); g.stroke(); }
  });
}

/** Transparent gaps at both tile edges, repeated continuously by each cloud card. */
export function hubCloudTexture(layer: number) {
  return tex(`hub-cloud-${layer}`, 1024, 160, g => {
    for (let i = 0; i < 4; i++) cloud(g, 110 + i * 255 + (layer % 2) * 30, 75 + (i % 2) * 20, 20 + (i * 13 + layer * 9) % 16);
  });
}

/** The directory kiosk's board: a little picture map of the wings. */
export function directoryTexture() {
  return tex("hub-directory", 512, 384, (g) => {
    g.fillStyle = "#0f4c63"; g.beginPath(); g.roundRect(0, 0, 512, 384, 30); g.fill();
    g.fillStyle = "#ffffff"; g.font = "900 46px system-ui, sans-serif"; g.textAlign = "center";
    g.fillText("AQUARIUM MAP", 256, 62);
    g.font = "700 28px system-ui, sans-serif"; g.fillText("マップ", 256, 100);
    g.fillStyle = "#f6d98b"; g.beginPath(); g.arc(256, 250, 46, 0, Math.PI * 2); g.fill();
    const blob = (x: number, y: number, c: string) => { g.fillStyle = c; g.beginPath(); g.roundRect(x - 52, y - 34, 104, 68, 16); g.fill(); g.strokeStyle = "#ffffff"; g.lineWidth = 5; g.beginPath(); g.moveTo(256, 250); g.lineTo(x, y); g.stroke(); };
    blob(90, 180, "#ffb35c");
    blob(120, 320, "#7c8a96");
    blob(410, 170, "#3a8fd6");
    blob(400, 320, "#7fd3f0");
    g.fillStyle = "#f6d98b"; g.beginPath(); g.arc(256, 250, 46, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#0f4c63"; g.font = "900 40px system-ui"; g.fillText("★", 256, 265);
  });
}
