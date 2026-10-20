import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt, type Effect } from "../game/runtime";
import { additiveSprite, coinTexture, heartTexture } from "./materials";

/** One-shot effects from rt.effects (hearts, coins, sparkles, splashes, confetti, a camera flash). */
export function Effects() {
  const [list, setList] = useState<Effect[]>([]);
  useFrame(() => {
    const now = rt.effects;
    if (now.length !== list.length || now.some((e, i) => e.id !== list[i]?.id)) setList([...now]);
  });
  return (
    <>
      {list.map((e) => {
        switch (e.kind) {
          case "hearts":
            return <Floaters key={e.id} e={e} tex="heart" />;
          case "coins":
            return <Floaters key={e.id} e={e} tex="coin" />;
          case "sparkle":
          case "poof":
            return <Sparkles key={e.id} e={e} />;
          case "splash":
            return <Splash key={e.id} e={e} />;
          case "confetti":
            return <Confetti key={e.id} e={e} />;
          case "flash":
            return <Flash key={e.id} e={e} />;
        }
        return null;
      })}
    </>
  );
}

function seeded(n: number) {
  let s = n * 9301 + 49297;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Hearts or coins that pop up, drift and fade. */
function Floaters({ e, tex }: { e: Effect; tex: "heart" | "coin" }) {
  const n = Math.max(1, Math.min(8, e.n));
  const items = useMemo(() => {
    const r = seeded(e.id);
    return Array.from({ length: n }, () => ({ dx: (r() - 0.5) * 0.7, dz: (r() - 0.5) * 0.3, delay: r() * 0.35, rise: 0.6 + r() * 0.5 }));
  }, [e.id, n]);
  const mats = useMemo(
    () => items.map(() => new THREE.SpriteMaterial({ map: tex === "heart" ? heartTexture() : coinTexture(), transparent: true, depthWrite: false, depthTest: false })),
    [items, tex]
  );
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  useFrame(() => {
    const age = rt.time - e.t0;
    items.forEach((it, i) => {
      const s = refs.current[i];
      if (!s) return;
      const k = Math.max(0, age - it.delay);
      const u = Math.min(1, k / 1.6);
      s.visible = k > 0 && u < 1;
      s.position.set(e.x + it.dx * Math.min(1, k * 3), e.y + it.rise * (1 - (1 - u) * (1 - u)), e.z + it.dz);
      const size = 0.32 * Math.min(1, k * 6) * (tex === "coin" ? 1 : 1.1);
      s.scale.set(size, size, 1);
      mats[i].opacity = 1 - Math.max(0, (u - 0.6) / 0.4);
    });
  });
  return (
    <>
      {items.map((_, i) => (
        <sprite key={i} ref={(s) => void (refs.current[i] = s)} material={mats[i]} visible={false} renderOrder={20} />
      ))}
    </>
  );
}

function Sparkles({ e }: { e: Effect }) {
  const n = Math.max(3, Math.min(12, e.n));
  const items = useMemo(() => {
    const r = seeded(e.id + 7);
    return Array.from({ length: n }, () => ({ a: r() * Math.PI * 2, r: 0.15 + r() * 0.35, up: r() * 0.4, delay: r() * 0.3 }));
  }, [e.id, n]);
  const mat = useMemo(() => additiveSprite("#fff6b0", 1), []);
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  useFrame(() => {
    const age = rt.time - e.t0;
    items.forEach((it, i) => {
      const s = refs.current[i];
      if (!s) return;
      const k = Math.max(0, age - it.delay) / 0.9;
      s.visible = k > 0 && k < 1;
      s.position.set(e.x + Math.cos(it.a) * it.r * k, e.y + it.up * k, e.z + Math.sin(it.a) * it.r * k);
      const size = 0.16 * Math.sin(Math.min(1, k) * Math.PI);
      s.scale.set(size, size, 1);
    });
  });
  return (
    <>
      {items.map((_, i) => (
        <sprite key={i} ref={(s) => void (refs.current[i] = s)} material={mat} visible={false} renderOrder={20} />
      ))}
    </>
  );
}

function Splash({ e }: { e: Effect }) {
  const ring = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }), []);
  useFrame(() => {
    const k = (rt.time - e.t0) / 0.9;
    if (!ring.current) return;
    ring.current.visible = k < 1;
    ring.current.scale.setScalar(0.2 + k * 1.2);
    mat.opacity = 0.9 * (1 - k);
  });
  return (
    <group position={[e.x, e.y + 0.01, e.z]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={20}>
        <ringGeometry args={[0.18, 0.24, 24]} />
      </mesh>
      <Sparkles e={{ ...e, kind: "sparkle", n: 8 }} />
    </group>
  );
}

const CONFETTI = ["#ff5c8a", "#ffd23f", "#4cd27a", "#4aa3ff", "#ff8a3d", "#b07bff"];

function Confetti({ e }: { e: Effect }) {
  const n = Math.max(10, Math.min(80, e.n));
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.PlaneGeometry(0.07, 0.11), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), []);
  const items = useMemo(() => {
    const r = seeded(e.id + 3);
    return Array.from({ length: n }, () => ({ x: (r() - 0.5) * 5, z: (r() - 0.5) * 3, vy: 0.6 + r() * 0.6, spin: r() * 8, delay: r() * 0.4 }));
  }, [e.id, n]);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const eul = useMemo(() => new THREE.Euler(), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const age = rt.time - e.t0;
    items.forEach((it, i) => {
      const k = Math.max(0, age - it.delay);
      pos.set(e.x + it.x * Math.min(1, k * 2) * 0.6 + Math.sin(k * 3 + i) * 0.1, e.y + 0.8 - k * it.vy, e.z + it.z * 0.6);
      eul.set(k * it.spin, k * it.spin * 0.7, 0);
      q.setFromEuler(eul);
      m4.compose(pos, q, one);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = age < 3.8;
  });
  const colored = useMemo(() => {
    return (m: THREE.InstancedMesh | null) => {
      ref.current = m;
      if (!m) return;
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) m.setColorAt(i, c.set(CONFETTI[i % CONFETTI.length]));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
  }, [n]);
  return <instancedMesh ref={colored} args={[geo, mat, n]} frustumCulled={false} renderOrder={21} />;
}

function Flash({ e }: { e: Effect }) {
  const ref = useRef<THREE.Sprite>(null);
  const mat = useMemo(() => additiveSprite("#ffffff", 1), []);
  useFrame(() => {
    const k = (rt.time - e.t0) / 0.35;
    if (!ref.current) return;
    ref.current.visible = k < 1;
    const s = 1.2 + k * 1.5;
    ref.current.scale.set(s, s, 1);
    mat.opacity = 1 - k;
  });
  return <sprite ref={ref} material={mat} position={[e.x, e.y, e.z]} renderOrder={22} />;
}
