import type { DecorKind, DecorVariant, SpeciesId, VisitorType } from "../game/types";
import type { Speaker } from "../game/store";

/** Inline SVG pictures of the fish, decorations and characters (shop cards, panels). */

export function FishPicture({ species, size = 80 }: { species: SpeciesId; size?: number }) {
  const p = { width: size, height: size * 0.7, viewBox: "0 0 100 70", "aria-hidden": true } as const;
  if (species === "clownfish")
    return (
      <svg {...p}>
        <path d="M14 35L2 20v30z" fill="#ff6f0f" stroke="#1c1c22" strokeWidth="2" />
        <ellipse cx="50" cy="35" rx="38" ry="22" fill="#ff6f0f" stroke="#1c1c22" strokeWidth="2" />
        <path d="M62 14c-3 14-3 28 0 42" stroke="#fff" strokeWidth="8" />
        <path d="M46 13c-3 15-3 29 0 44" stroke="#fff" strokeWidth="9" />
        <path d="M24 18c-2 12-2 22 0 34" stroke="#fff" strokeWidth="7" />
        <path d="M40 13c4-6 14-8 20-2" fill="#ff6f0f" stroke="#1c1c22" strokeWidth="2" />
        <circle cx="74" cy="31" r="7" fill="#fff" />
        <circle cx="75.5" cy="31.5" r="4.2" fill="#15202b" />
        <circle cx="77" cy="29" r="1.5" fill="#fff" />
        <ellipse cx="72" cy="42" rx="4" ry="2.4" fill="#ff9fb0" />
      </svg>
    );
  if (species === "bluetang")
    return (
      <svg {...p}>
        <path d="M16 35L3 17v36z" fill="#ffd23f" stroke="#14245e" strokeWidth="2" />
        <ellipse cx="52" cy="35" rx="38" ry="25" fill="#2a62e6" />
        <path d="M24 30c10-10 30-12 46-4-14-2-28 0-36 10-4-2-7-4-10-6z" fill="#14245e" />
        <path d="M22 30c2 6 6 8 10 9" fill="#ffd23f" />
        <path d="M20 13c14-4 34-4 50 2" fill="none" stroke="#14245e" strokeWidth="4" strokeLinecap="round" />
        <circle cx="76" cy="31" r="6.5" fill="#fff" />
        <circle cx="77.5" cy="31.5" r="4" fill="#15202b" />
        <circle cx="79" cy="29" r="1.4" fill="#fff" />
        <ellipse cx="74" cy="44" rx="4" ry="2.4" fill="#ff9fb0" />
      </svg>
    );
  return (
    <svg {...p}>
      <path d="M22 35L8 22v26z" fill="#ffe98a" stroke="#ff9a1f" strokeWidth="2" />
      <path d="M30 18c8-14 22-14 28-8M30 52c8 12 20 12 26 6" fill="#ffd92e" stroke="#ff9a1f" strokeWidth="2" />
      <circle cx="48" cy="35" r="24" fill="#ffd92e" />
      <path d="M70 31l16 3-16 5z" fill="#ffd92e" />
      <path d="M62 14c-3 14-3 28 0 42" stroke="#2a2a33" strokeWidth="7" />
      <circle cx="36" cy="22" r="4.5" fill="#2a2a33" />
      <circle cx="63" cy="31" r="6.5" fill="#fff" />
      <circle cx="64" cy="31.5" r="4" fill="#15202b" />
      <circle cx="65.5" cy="29" r="1.4" fill="#fff" />
      <ellipse cx="56" cy="44" rx="4" ry="2.4" fill="#ff9fb0" />
    </svg>
  );
}

export function DecorPicture({ kind, variant, size = 72 }: { kind: DecorKind; variant?: DecorVariant; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 60 60", "aria-hidden": true } as const;
  const sand = <ellipse cx="30" cy="54" rx="24" ry="5" fill="#ecd9a4" />;
  switch (kind) {
    case "plant": {
      const big = variant !== "small";
      return (
        <svg {...p}>
          {sand}
          <g transform={big ? undefined : "translate(10 22) scale(0.66)"}>
            <path d="M30 54c-2-14-12-22-16-40 8 6 12 14 14 22 0-14 2-24 6-34 2 12 1 24-2 34 4-8 9-14 16-18-5 12-12 22-16 36z" fill="#2fbf5a" />
            <path d="M30 54c-1-10 2-20 4-28" stroke="#25a34b" strokeWidth="2" fill="none" />
          </g>
        </svg>
      );
    }
    case "coral": {
      const c = variant === "red" ? "#ff4a5c" : variant === "blue" ? "#3d8bff" : "url(#cg)";
      return (
        <svg {...p}>
          <defs>
            <linearGradient id="cg" x1="0" x2="1">
              <stop offset="0.5" stopColor="#ff4a5c" />
              <stop offset="0.5" stopColor="#3d8bff" />
            </linearGradient>
          </defs>
          {sand}
          <path d="M30 54V36M30 40l-10-12M30 38l10-14M20 28l-4-10M20 28l4-12M40 24l-2-12M40 24l6-8M30 36l2-14" stroke={c} strokeWidth="6" strokeLinecap="round" fill="none" />
          {[
            [16, 18],
            [24, 16],
            [38, 12],
            [46, 16],
            [32, 22]
          ].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r="4" fill={variant === "blue" ? "#a9d8ff" : variant === "red" ? "#ffa3ae" : "#fff"} />
          ))}
        </svg>
      );
    }
    case "rock": {
      const big = variant !== "small";
      return (
        <svg {...p}>
          {sand}
          <g transform={big ? undefined : "translate(12 24) scale(0.6)"}>
            <path d="M10 54l4-18 12-8 14 4 8 12 2 10z" fill="#8d99a6" stroke="#5f6b78" strokeWidth="2" />
            <path d="M26 28l6-10 10 2 4 10-6 2z" fill="#a3adb8" stroke="#5f6b78" strokeWidth="2" />
          </g>
        </svg>
      );
    }
    case "shell":
      return (
        <svg {...p}>
          {sand}
          <path d="M12 50c0-14 8-26 18-26s18 12 18 26z" fill="#ffc7cf" stroke="#ff8fa3" strokeWidth="2" />
          <path d="M30 24v26M22 27l4 23M38 27l-4 23M15 36l9 14M45 36l-9 14" stroke="#ff8fa3" strokeWidth="2" />
        </svg>
      );
    case "chest":
      return (
        <svg {...p}>
          {sand}
          <rect x="12" y="32" width="36" height="20" rx="2" fill="#8a5326" />
          <path d="M12 32c0-10 8-14 18-14s18 4 18 14z" fill="#9a5d2b" />
          <rect x="18" y="18" width="4" height="34" fill="#ffc935" />
          <rect x="38" y="18" width="4" height="34" fill="#ffc935" />
          <rect x="27" y="30" width="6" height="7" rx="1" fill="#ffc935" />
        </svg>
      );
    case "bubbler":
      return (
        <svg {...p}>
          {sand}
          <ellipse cx="30" cy="48" rx="12" ry="6" fill="#7d8a99" />
          <rect x="28" y="38" width="5" height="8" fill="#c99a3a" />
          {[
            [30, 32, 4],
            [34, 22, 3],
            [28, 13, 4],
            [33, 5, 2.5]
          ].map(([x, y, r]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r={r} fill="none" stroke="#7cc8ff" strokeWidth="2" />
          ))}
        </svg>
      );
  }
}

export function PicoFace({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" aria-hidden>
      <circle cx="30" cy="30" r="29" fill="#bfeeff" />
      <ellipse cx="30" cy="38" rx="20" ry="22" fill="#26303d" />
      <ellipse cx="30" cy="42" rx="13" ry="15" fill="#fff" />
      <ellipse cx="24" cy="30" rx="5" ry="6" fill="#fff" />
      <ellipse cx="36" cy="30" rx="5" ry="6" fill="#fff" />
      <circle cx="24.5" cy="31" r="3" fill="#15202b" />
      <circle cx="35.5" cy="31" r="3" fill="#15202b" />
      <path d="M26 37h8l-4 5z" fill="#ff9f1c" />
      <ellipse cx="18" cy="38" rx="3" ry="2" fill="#ffb3c1" />
      <ellipse cx="42" cy="38" rx="3" ry="2" fill="#ffb3c1" />
      <path d="M14 20c2-10 30-10 32 0z" fill="#1f7ae0" />
      <path d="M30 20h18c0 3-4 4-10 4z" fill="#1f7ae0" />
      <circle cx="30" cy="15" r="3" fill="#ffd23f" />
    </svg>
  );
}

const PEOPLE: Record<VisitorType, { shirt: string; hair: string; hat?: string }> = {
  child: { shirt: "#ff6b6b", hair: "#3a2a1e", hat: "#ffd43b" },
  adult: { shirt: "#748ffc", hair: "#2b1d14" },
  fan: { shirt: "#22b8cf", hair: "#2f1f12", hat: "#ff7a1a" },
  judge: { shirt: "#2b3a67", hair: "#c8c8c8" }
};

export function PersonFace({ type, size = 56 }: { type: VisitorType; size?: number }) {
  const c = PEOPLE[type];
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" aria-hidden>
      <circle cx="30" cy="30" r="29" fill="#fff4d6" />
      <path d="M8 60c0-12 10-18 22-18s22 6 22 18z" fill={c.shirt} />
      <circle cx="30" cy="28" r="14" fill="#f6d2b0" />
      <path d="M16 26c0-12 28-12 28 0-6-5-22-5-28 0z" fill={c.hair} />
      <circle cx="25" cy="29" r="2" fill="#1b1f27" />
      <circle cx="35" cy="29" r="2" fill="#1b1f27" />
      <path d="M25 35a6 6 0 0 0 10 0" fill="none" stroke="#8a3b3b" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="21" cy="33" rx="2.5" ry="1.6" fill="#ffa8a8" />
      <ellipse cx="39" cy="33" rx="2.5" ry="1.6" fill="#ffa8a8" />
      {type === "child" && <path d="M15 20c2-10 28-10 30 0zM30 18h18c0 3-5 4-12 4z" fill={c.hat} />}
      {type === "fan" && (
        <g>
          <ellipse cx="30" cy="11" rx="13" ry="6" fill={c.hat} />
          <path d="M17 11l-8-5v10z" fill={c.hat} />
          <circle cx="38" cy="10" r="2" fill="#fff" />
        </g>
      )}
      {type === "judge" && (
        <g>
          <path d="M24 38c3 2 9 2 12 0" stroke={c.hair} strokeWidth="3" strokeLinecap="round" />
          <circle cx="40" cy="50" r="5" fill="#ffcc33" />
          <circle cx="40" cy="50" r="3" fill="#e03131" />
          <path d="M26 44l4 3 4-3-4 5z" fill="#e03131" />
        </g>
      )}
    </svg>
  );
}

export function SpeakerFace({ by, size = 56 }: { by: Speaker; size?: number }) {
  if (by === "pico" || by === "game") return <PicoFace size={size} />;
  if (by === "self") return <PersonFace type="child" size={size} />;
  if (by === "clownfish" || by === "bluetang" || by === "yellowfish")
    return (
      <span className="face-fish" style={{ width: size, height: size }}>
        <FishPicture species={by} size={size * 0.9} />
      </span>
    );
  return <PersonFace type={by} size={size} />;
}
