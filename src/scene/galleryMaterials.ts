import * as THREE from "three";

const textures = new Map<string, THREE.CanvasTexture>();
function texture(key: string, size: number, draw: (g: CanvasRenderingContext2D) => void) {
  let t = textures.get(key);
  if (!t) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    draw(canvas.getContext("2d")!);
    t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    textures.set(key, t);
  }
  return t;
}

export const galleryWallMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

export const galleryFloorTexture = () => texture("floor", 512, (g) => {
  g.fillStyle = "#080f24";
  g.fillRect(0, 0, 512, 512);
  for (const x of [110, 256, 402]) {
    const pool = g.createRadialGradient(x, 160, 0, x, 160, 100);
    pool.addColorStop(0, "#183852");
    pool.addColorStop(1, "rgba(17,39,65,0)");
    g.fillStyle = pool;
    g.fillRect(x - 100, 60, 200, 200);
  }
});

export const galleryJellyTexture = () => {
  const t = texture("jellies", 256, (g) => {
    g.fillStyle = "#07162d";
    g.fillRect(0, 0, 256, 256);
    for (const [x, y, r, colour] of [
      [65, 70, 23, "#a0e5ff"], [175, 145, 30, "#b59bff"], [85, 215, 17, "#71cddd"]
    ] as const) {
      g.shadowColor = colour;
      g.shadowBlur = 15;
      g.fillStyle = colour;
      g.globalAlpha = 0.65;
      g.beginPath();
      g.ellipse(x, y, r, r * 0.65, 0, Math.PI, 2 * Math.PI);
      g.quadraticCurveTo(x, y + r * 0.3, x - r, y);
      g.fill();
      g.strokeStyle = colour;
      g.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(x + i * r * 0.25, y);
        g.bezierCurveTo(x + i * r * 0.25 - 9, y + 12, x + i * r * 0.25 + 10, y + 22, x + i * r * 0.25, y + r * 1.5);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

export const galleryShaftTexture = () => texture("shaft", 64, (g) => {
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(125,175,255,0.22)");
  gradient.addColorStop(0.45, "rgba(105,145,255,0.08)");
  gradient.addColorStop(1, "rgba(105,145,255,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
});
