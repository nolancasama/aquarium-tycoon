import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { getGame, useGame } from "../../game/store";
import { effect, rt } from "../../game/runtime";
import { RUSH_DECOR } from "../../game/data/rushDecor";
import { hasRushReward } from "../../game/rush/types";
import { openRushAwards } from "../../game/rush/bridge";
import { flatMat } from "../materials";
import { useAreaGate, wingShown } from "../tunnel/wing";
import { cabinetGeometry, rewardGeometry } from "./models";

const noRaycast = () => undefined;
const metal = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .65, roughness: .28, flatShading: true });
const glow = new THREE.MeshBasicMaterial({ color: "#fff1b0", toneMapped: false });
const glass = new THREE.MeshBasicMaterial({ color: "#a5eeef", transparent: true, opacity: .12, depthWrite: false });
const bubbleMaterial = new THREE.MeshLambertMaterial({ color: "#b5f4ff", emissive: "#24566a", transparent: true, opacity: .72 });
const REWARDS = ["floorPattern", "goldSign", "bubbleFountain", "bench", "sharkStatue"] as const;
type DecorId = keyof typeof RUSH_DECOR;

/** Keep mounted while changing halls: saved rewards never replay their reveal. */
export function RushDecor() {
  const unlocked = useGame((g) => Boolean(g.model.rush?.unlocked));
  const ref = useAreaGate(() => getGame().hall === 0 && !wingShown() && getGame().view === "room");
  return <group ref={ref}>
    <Reveal id="cabinet" shown={unlocked}><Cabinet /></Reveal>
    {REWARDS.map((id) => <Reward key={id} id={id} unlocked={unlocked} />)}
  </group>;
}

function Reveal({ id, shown, children }: { id: DecorId; shown: boolean; children: ReactNode }) {
  const p = RUSH_DECOR[id];
  const ref = useRef<THREE.Group>(null);
  const previous = useRef(shown);
  const born = useRef(-100);
  useEffect(() => {
    if (shown && !previous.current && revealLive(id)) {
      born.current = rt.time;
      effect("sparkle", p.x, p.y + (id === "floorPattern" ? .15 : 1), p.z, 12);
    }
    previous.current = shown;
  }, [shown, id, p]);
  useFrame(() => {
    if (!ref.current) return;
    const t = Math.min(1, Math.max(0, (rt.time - born.current) / .65));
    ref.current.scale.setScalar(t < 1 ? .15 + .85 * (1 - Math.pow(1 - t, 3)) + Math.sin(t * Math.PI) * .12 : 1);
  });
  return <group ref={ref} visible={shown} position={[p.x, p.y, p.z]} rotation={[0, p.facing, 0]}>{children}</group>;
}

/**
 * A reward is only earned live at the results screen (commitResult), and the cabinet at
 * unlock, before Pico's intro. Anything else that flips "shown" is a save loading behind
 * the title screen, which must not replay the reveal.
 */
function revealLive(id: DecorId): boolean {
  const rush = getGame().model.rush;
  return rush?.phase === "results" || (id === "cabinet" && !rush?.introSeen);
}

function cabinetTap(e: ThreeEvent<MouseEvent>) {
  const g = getGame();
  if (e.delta > 8 || g.screen !== "game" || g.hall !== 0 || g.view !== "room" || wingShown() ||
      !g.model.rush?.unlocked || g.mode !== "play" || g.prompt || g.line || g.stageCard ||
      g.settingsOpen || g.panel || g.placing || rt.celebrations.size || rt.explore.transition) return;
  // A foreground visitor/tank gets priority even when its handler lets events through.
  if (e.intersections[0]?.object !== e.object) return;
  e.stopPropagation();
  openRushAwards();
}

function labelsMaterial() {
  const c = document.createElement("canvas");
  c.width = 768; c.height = 1024;
  const ctx = c.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.fillStyle = "#155d6a"; ctx.fillRect(56, 14, 656, 130);
  ctx.fillStyle = "#fff2bf"; ctx.font = "bold 77px sans-serif"; ctx.fillText("RUSH HOUR", 384, 105);
  ctx.font = "bold 35px sans-serif";
  for (let i = 0; i < 3; i++) {
    const x = 159 + i * 225;
    ctx.fillStyle = "#155d6a"; ctx.fillRect(x - 104, 531, 208, 63);
    ctx.fillStyle = "#fff2bf"; ctx.fillText(["BRONZE", "SILVER", "GOLD"][i], x, 576);
  }
  ctx.fillStyle = "#fff2bf"; ctx.font = "29px sans-serif"; ctx.fillText("FUTURE TROPHIES", 384, 905);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false });
}

function Cabinet() {
  const medals = useGame((g) => ["bronze", "silver", "gold"].map((m) => (g.model.rush?.stats[m as "bronze" | "silver" | "gold"] ?? 0) > 0 ? "1" : "0").join(""));
  const geometry = useMemo(() => cabinetGeometry([...medals].map((m) => m === "1")), [medals]);
  const labels = useMemo(labelsMaterial, []);
  const previous = useRef(medals);
  useEffect(() => {
    if (getGame().model.rush?.phase === "results" &&
        [...medals].some((m, i) => m === "1" && previous.current[i] === "0")) {
      const p = RUSH_DECOR.cabinet;
      effect("sparkle", p.x, 1.3, p.z, 8);
    }
    previous.current = medals;
  }, [medals]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => { labels.map?.dispose(); labels.dispose(); }, [labels]);
  return <group scale={[.76, 1, .76]}>
    <mesh geometry={geometry} material={flatMat} onClick={cabinetTap} />
    <mesh position={[0, 1.01, .284]} material={labels} onClick={cabinetTap}><planeGeometry args={[1.5, 2]} /></mesh>
    <mesh position={[0, 1.08, .263]} material={glass} onClick={cabinetTap}><planeGeometry args={[1.3, 1.57]} /></mesh>
    <mesh position={[0, 1.82, -.12]} material={glow} raycast={noRaycast}><boxGeometry args={[1.22, .035, .08]} /></mesh>
  </group>;
}

function Reward({ id, unlocked }: { id: typeof REWARDS[number]; unlocked: boolean }) {
  const earned = useGame((g) => hasRushReward(g.model.rush, id));
  const geometry = useMemo(() => rewardGeometry(id), [id]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const s = id === "bubbleFountain" ? .9 : id === "sharkStatue" ? .7 : 1;
  return <Reveal id={id} shown={unlocked && earned}>
    <group scale={[s, 1, id === "bench" ? .9 : s]}>
      <mesh geometry={geometry} material={id === "goldSign" || id === "sharkStatue" ? metal : flatMat} raycast={noRaycast} />
      {id === "bubbleFountain" && <Bubbles active={unlocked && earned} />}
    </group>
  </Reveal>;
}

function Bubbles({ active }: { active: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    if (!active || !ref.current || getGame().hall !== 0 || wingShown()) return;
    for (let i = 0; i < 8; i++) {
      const t = (rt.time * .42 + i / 8) % 1;
      dummy.position.set(Math.sin(i * 2.4 + t * 3) * .14, .76 + t * .9, Math.cos(i * 2.4) * .12);
      dummy.scale.setScalar(.035 + Math.sin(t * Math.PI) * .025);
      dummy.updateMatrix(); ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[undefined, bubbleMaterial, 8]} frustumCulled={false} raycast={noRaycast}>
    <sphereGeometry args={[1, 8, 6]} />
  </instancedMesh>;
}
