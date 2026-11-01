import * as THREE from "three";

// Like the Gallery, the Atrium bakes its lighting into local materials. Its
// sunny colours never require scene lights that wash out neighbouring rooms.
export const atriumMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
export const atriumGlassMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.19, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });

let floor: THREE.CanvasTexture | undefined;
export function atriumFloorTexture(): THREE.CanvasTexture {
  if (floor) return floor;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 704;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#f2dfbe";
  g.fillRect(0, 0, 1024, 704);
  // Fine terrazzo joints and two broad turquoise loops give the large floor
  // a public-aquarium scale while preserving clear paths around the habitat.
  g.strokeStyle = "#dfcba9";
  g.lineWidth = 1;
  for (let x = 0; x <= 1024; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 704); g.stroke(); }
  for (let y = 0; y <= 704; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); }
  for (const [rx, ry, colour, width] of [[267, 175, "#87c9bd", 17], [292, 200, "#fff0d3", 5]] as const) {
    g.beginPath(); g.ellipse(512, 288, rx, ry, 0, 0, Math.PI * 2);
    g.strokeStyle = colour; g.lineWidth = width; g.stroke();
  }
  const sunlight = g.createLinearGradient(0, 0, 450, 704);
  sunlight.addColorStop(0, "rgba(255,255,236,0)");
  sunlight.addColorStop(0.4, "rgba(255,255,236,.30)");
  sunlight.addColorStop(1, "rgba(255,255,236,0)");
  g.fillStyle = sunlight;
  for (const x of [130, 420, 710]) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 90, 0); g.lineTo(x + 240, 704); g.lineTo(x + 70, 704); g.fill();
  }
  // Mosaic rays from the reef ring, a wave border and a starfish medallion at
  // the Gallery doorway: detail painted into the one floor texture (no draw calls).
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    for (let k = 0; k < 9; k++) {
      const d = 1.18 + k * 0.075;
      const x = 512 + Math.cos(a) * 292 * d, y = 288 + Math.sin(a) * 200 * d;
      if (x < 70 || x > 954 || y < 70 || y > 634) continue;
      g.fillStyle = k % 3 === 0 ? "rgba(255,240,211,.9)" : i % 2 ? "rgba(135,201,189,.55)" : "rgba(233,149,121,.4)";
      g.fillRect(x - 5, y - 5, 10, 10);
    }
  }
  g.lineWidth = 7;
  g.strokeStyle = "#87c9bd";
  for (const inset of [36, 668]) {
    g.beginPath();
    for (let x = 36; x <= 988; x += 8) g.lineTo(x, inset + Math.sin(x / 26) * 7);
    g.stroke();
  }
  g.fillStyle = "rgba(135,201,189,.5)";
  for (let x = 44; x < 988; x += 26) { g.fillRect(x, 16, 12, 12); g.fillRect(x, 676, 12, 12); }
  g.save();
  g.translate(118, 448);
  g.fillStyle = "#87c9bd";
  g.beginPath(); g.arc(0, 0, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#fff0d3";
  g.beginPath(); g.arc(0, 0, 54, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#e99579";
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 17 : 44, a = -Math.PI / 2 + i * Math.PI / 5;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath(); g.fill();
  g.restore();
  floor = new THREE.CanvasTexture(canvas);
  floor.colorSpace = THREE.SRGBColorSpace;
  return floor;
}

let shaft: THREE.MeshBasicMaterial | undefined;
export function atriumShaftMaterial(): THREE.MeshBasicMaterial {
  if (shaft) return shaft;
  const canvas = document.createElement("canvas");
  canvas.width = 64; canvas.height = 128;
  const g = canvas.getContext("2d")!;
  const gradient = g.createRadialGradient(32, 64, 0, 32, 64, 62);
  gradient.addColorStop(0, "rgba(255,246,195,.14)");
  gradient.addColorStop(0.45, "rgba(255,246,195,.05)");
  gradient.addColorStop(1, "rgba(255,246,195,0)");
  g.fillStyle = gradient; g.fillRect(0, 0, 64, 128);
  shaft = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  return shaft;
}
