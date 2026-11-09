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

/** What each doorway shows beyond it (512 × 680, portrait like the opening). */
export function doorArtTexture(kind: HubDestination, open: boolean) {
  return tex(`hub-door-${kind}-${open}`, 512, 680, (g) => {
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
      sky(g, W, H, "#7fd0ff", "#dff5ff");
      g.fillStyle = "#ffe58a"; g.beginPath(); g.arc(400, 120, 55, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#2bb6c9"; g.fillRect(0, H * 0.56, W, H * 0.44);
      g.fillStyle = "#6c8fa8";
      g.beginPath(); g.moveTo(120, 420); g.quadraticCurveTo(240, 300, 360, 380); g.quadraticCurveTo(250, 360, 160, 430); g.fill();
      g.beginPath(); g.moveTo(230, 345); g.lineTo(250, 300); g.lineTo(275, 350); g.fill();
    } else {
      sky(g, W, H, "#ffb27a", "#ffe2b8");
      g.fillStyle = "#3a6f8f"; g.fillRect(0, H * 0.58, W, H * 0.42);
      g.fillStyle = "#4e6a55";
      g.beginPath(); g.moveTo(0, H * 0.6); g.quadraticCurveTo(90, H * 0.44, 200, H * 0.6); g.fill();
      g.fillStyle = "#26323b";
      g.beginPath(); g.moveTo(300, 470); g.quadraticCurveTo(320, 400, 280, 360); g.quadraticCurveTo(330, 380, 340, 330);
      g.quadraticCurveTo(350, 380, 400, 360); g.quadraticCurveTo(360, 400, 380, 470); g.fill();
    }
    if (!open) {
      g.fillStyle = "rgba(20,40,60,0.38)";
      g.fillRect(0, 0, W, H);
    }
    // Soft arch vignette so the picture reads as a view through a doorway.
    const v = g.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 420);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.35)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
    if (kind === "lagoon" || kind === "sanctuary") {
      g.save();
      g.translate(W / 2, H * 0.84);
      g.rotate(-0.08);
      g.fillStyle = "#ffcf3f";
      g.fillRect(-230, -38, 460, 76);
      g.fillStyle = "#3b2a00";
      g.font = "900 44px system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("COMING SOON", 0, 2);
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
