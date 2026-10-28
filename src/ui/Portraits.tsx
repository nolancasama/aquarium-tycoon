import type { DecorKind, DecorVariant, SpeciesId, TankType, VisitorType } from "../game/types";
import type { Speaker } from "../game/store";
import { SPECIES } from "../game/data/fish";

/** Inline SVG pictures of the fish, decorations and characters (shop cards, panels). */

export function FishPicture({ species, size = 80 }: { species: SpeciesId; size?: number }) {
  const p = { width: size, height: size * 0.7, viewBox: "0 0 100 70", "aria-hidden": true } as const;
  const eye = (x: number, y: number, r = 6) => (
    <>
      <circle cx={x} cy={y} r={r} fill="#fff" />
      <circle cx={x + r * 0.25} cy={y + r * 0.1} r={r * 0.62} fill="#15202b" />
      <circle cx={x + r * 0.45} cy={y - r * 0.3} r={r * 0.22} fill="#fff" />
    </>
  );
  if (species === "angelfish")
    return (
      <svg {...p}>
        <path d="M28 35L8 21v28zM38 22L60 3l1 22M38 46l21 20 2-22" fill="#a677e1" stroke="#7550b4" strokeWidth="2" strokeLinejoin="round" />
        <path d="M23 35Q48 0 77 27l10 8-10 9Q48 69 23 35" fill="#b88aee" stroke="#7550b4" strokeWidth="2" />
        <path d="M43 17q-5 18 0 36M58 18q-4 18 0 35" stroke="#7044a9" strokeWidth="5" />
        <path d="M49 48l-5 16M57 49l1 15" stroke="#d7b9fa" strokeWidth="2" strokeLinecap="round" />
        <path d="M36 28q12-13 24-7" stroke="#e4d1ff" strokeWidth="3" fill="none" strokeLinecap="round" />
        {eye(72, 31, 5)}
      </svg>
    );
  if (species === "goby")
    return (
      <svg {...p}>
        <path d="M27 38L8 26v23zM41 27l5-13 13 3 7 12" fill="#ed7869" stroke="#b74143" strokeWidth="2" />
        <path d="M22 39q22-20 53-12 18 5 14 18-26 15-67-6z" fill="#ed5c57" stroke="#b74143" strokeWidth="2" />
        <path d="M26 44q24 13 55 0" fill="#ffb19a" />
        <path d="M43 34l-4 10M56 31l-3 13M68 31l-2 12" stroke="#b74143" strokeWidth="4" />
        <path d="M61 44l-13 13 23-7" fill="#f58471" stroke="#b74143" strokeWidth="1.5" />
        {eye(78, 32, 5)}
        <path d="M85 42h6M40 55H26M62 58h17" stroke="#d3ba83" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (species === "chromis")
    return (
      <svg {...p}>
        {[[13, 16], [43, 10], [66, 23], [12, 43], [42, 38], [69, 48]].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <path d="M6 9L0 3v12zM11 3l7-3 4 5" fill="#3baa87" />
            <ellipse cx="17" cy="9" rx="12" ry="7" fill="#62d8af" stroke="#269c7f" strokeWidth="1.2" />
            <path d="M11 6q7-4 12 0" fill="none" stroke="#b7f4d8" strokeWidth="2" strokeLinecap="round" />
            <circle cx="24" cy="8" r="2.2" fill="#fff" /><circle cx="24.6" cy="8" r="1.3" fill="#153c3e" />
          </g>
        ))}
      </svg>
    );
  if (species === "eel")
    return (
      <svg {...p}>
        <path d="M10 49q28 20 31-4t26-14" fill="none" stroke="#427a48" strokeWidth="18" strokeLinecap="round" />
        <path d="M12 45q22 17 25-6t30-15" fill="none" stroke="#8caf59" strokeWidth="9" strokeLinecap="round" />
        <path d="M54 28q12-17 30-8 11 7 4 18-12 7-27 0" fill="#82a954" stroke="#427a48" strokeWidth="2" />
        {[[22, 51], [36, 48], [44, 29], [57, 30], [65, 22]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="2.5" fill="#42673c" />)}
        {eye(78, 24, 4.6)}
        <path d="M78 34q9 3 14-2" fill="none" stroke="#294b34" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (species === "octopus")
    return (
      <svg {...p}>
        {["M43 42Q14 33 14 53q0 9 8 4", "M47 44Q26 46 29 58q2 7 8 1", "M50 45Q42 58 47 62q7 6 9-4", "M54 44Q61 64 70 59q7-5-1-10", "M58 42Q83 37 85 51q2 10-7 7"].map((d, i) => <path key={i} d={d} stroke="#ed874a" strokeWidth="9" fill="none" strokeLinecap="round" />)}
        <ellipse cx="50" cy="28" rx="22" ry="24" fill="#f49a59" stroke="#d6733f" strokeWidth="1.5" />
        <ellipse cx="42" cy="16" rx="7" ry="4" fill="#ffd0a0" transform="rotate(-25 42 16)" />
        {eye(41, 31, 5)}{eye(59, 31, 5)}
        <path d="M46 41q4 4 8 0" stroke="#8f4934" strokeWidth="2" fill="none" strokeLinecap="round" />
        {[22, 35, 49, 66, 81].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 56 : 53} r="2" fill="#ffd1ab" />)}
      </svg>
    );
  if (species === "crab")
    return (
      <svg {...p}>
        <path d="M30 40L15 36 9 42M30 46L13 48 8 56M34 51L22 57 21 63M70 40l15-4 6 6M70 46l17 2 5 8M66 51l12 6 1 6" stroke="#c64e47" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M34 37L24 23M66 37l10-14" stroke="#eb6557" strokeWidth="6" strokeLinecap="round" />
        <path d="M23 28Q7 24 13 10l8 9 4-13q14 9-2 22M77 28q16-4 10-18l-8 9-4-13q-14 9 2 22" fill="#ef7261" stroke="#c64e47" strokeWidth="1.5" strokeLinejoin="round" />
        <ellipse cx="50" cy="44" rx="26" ry="15" fill="#f27865" stroke="#c64e47" strokeWidth="2" />
        <path d="M40 33v-7M60 33v-7" stroke="#c64e47" strokeWidth="4" strokeLinecap="round" />
        {eye(40, 25, 4)}{eye(60, 25, 4)}
        <path d="M44 45q6 6 12 0" stroke="#923e3a" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    );
  if (species === "stingray")
    return (
      <svg {...p}>
        <path d="M49 42q-3 19 24 24" stroke="#436ca8" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M50 10Q34 24 8 37q5 19 40 12 35 7 44-12Q68 23 56 10q-3-3-6 0" fill="#719dd1" stroke="#436ca8" strokeWidth="2" />
        <path d="M17 38q17 6 31 3 18 4 35-3" stroke="#a3c6eb" strokeWidth="3" fill="none" strokeLinecap="round" />
        {[[33, 31], [40, 38], [66, 31], [61, 39]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="2" fill="#c4def4" />)}
        {eye(44, 24, 3.3)}{eye(59, 24, 3.3)}
      </svg>
    );
  if (species === "moonjelly" || species === "spottedjelly" || species === "seanettle") {
    const moon = species === "moonjelly";
    const nettle = species === "seanettle";
    const bell = moon ? "#e7f1f9" : nettle ? "#f3a25e" : "#72b9ec";
    const edge = moon ? "#aac8df" : nettle ? "#d47a44" : "#438fcb";
    return (
      <svg {...p}>
        {[34, 42, 50, 58, 66].map((x, i) => <path key={x} d={`M${x} 32q${i % 2 ? 8 : -8} 10 0 18t${nettle ? -2 : 0} ${nettle ? 16 : 8}`} stroke={edge} strokeWidth={nettle ? 2 : 3} fill="none" strokeLinecap="round" />)}
        <path d="M25 33a25 24 0 0 1 50 0q-5 5-10 0-5 5-10 0-5 5-10 0-5 5-10 0-5 5-10 0" fill={bell} stroke={edge} strokeWidth="1.7" />
        {moon && [[43, 17], [51, 15], [43, 24], [51, 23]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="4.4" fill="none" stroke="#c6badd" strokeWidth="1.5" />)}
        {!moon && [[35, 25], [44, 16], [55, 14], [63, 23], [49, 27]].map(([x, y]) => <circle key={x} cx={x} cy={y} r={nettle ? 2 : 2.8} fill={nettle ? "#ffd8a5" : "#eaf7ff"} />)}
        <path d="M33 23q2-8 10-10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
      </svg>
    );
  }
  if (species === "pufferfish")
    return (
      <svg {...p}>
        <path d="M20 35L8 26v18z" fill="#f1e4c4" stroke="#a07a4a" strokeWidth="2" />
        {Array.from({ length: 14 }, (_, i) => {
          const a = (i / 14) * Math.PI * 2;
          return <path key={i} d={`M${52 + Math.cos(a) * 26} ${35 + Math.sin(a) * 24}l${Math.cos(a) * 7} ${Math.sin(a) * 7}`} stroke="#c9b48a" strokeWidth="3" strokeLinecap="round" />;
        })}
        <ellipse cx="52" cy="35" rx="28" ry="26" fill="#f6f1e4" stroke="#c9b48a" strokeWidth="1.5" />
        <ellipse cx="52" cy="47" rx="22" ry="12" fill="#fbe7a1" />
        {[
          [40, 22],
          [52, 18],
          [36, 32],
          [60, 26]
        ].map(([x, y]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="3.2" fill="#a07a4a" />
        ))}
        {eye(68, 30, 7)}
        <ellipse cx="80" cy="38" rx="3.5" ry="3" fill="#ff8fa3" />
      </svg>
    );
  if (species === "turtle")
    return (
      <svg {...p}>
        <ellipse cx="30" cy="22" rx="16" ry="6" fill="#86c25a" transform="rotate(-25 30 22)" />
        <ellipse cx="30" cy="50" rx="16" ry="6" fill="#86c25a" transform="rotate(25 30 50)" />
        <ellipse cx="74" cy="36" rx="11" ry="9" fill="#9ccf6a" />
        <ellipse cx="46" cy="36" rx="30" ry="20" fill="#3f9b5b" />
        <path d="M46 18v36M30 26l32 20M30 46l32-20" stroke="#2e7d45" strokeWidth="3" />
        {eye(77, 33, 4.5)}
        <path d="M78 41q4 2 7-1" stroke="#2d5a1e" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    );
  if (species === "seahorse")
    return (
      <svg {...p}>
        <path d="M52 10c10 0 14 8 10 14s-12 6-12 16 10 12 6 20-14 4-12-4" fill="none" stroke="#ff8fb8" strokeWidth="12" strokeLinecap="round" />
        <path d="M58 14l16 4" stroke="#ff8fb8" strokeWidth="7" strokeLinecap="round" />
        <path d="M44 34l-8 4 8 4" fill="#ffd6e6" />
        {eye(56, 13, 3.5)}
      </svg>
    );
  if (species === "jellyfish")
    return (
      <svg {...p}>
        {[38, 44, 50, 56, 62].map((x, i) => (
          <path key={x} d={`M${x} 34q${i % 2 ? 6 : -6} 12 0 26`} stroke="#d9a8ff" strokeWidth="3" fill="none" strokeLinecap="round" />
        ))}
        <path d="M28 34a22 22 0 0 1 44 0z" fill="#c38bff" opacity="0.9" />
        <path d="M28 34h44" stroke="#a86bff" strokeWidth="3" />
        <circle cx="43" cy="24" r="2.6" fill="#3a1a5a" />
        <circle cx="57" cy="24" r="2.6" fill="#3a1a5a" />
        <path d="M46 29q4 3 8 0" stroke="#3a1a5a" strokeWidth="2" fill="none" />
      </svg>
    );
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
    case "kelp":
      return (
        <svg {...p}>
          {sand}
          <path d="M30 54q-9-17 0-48M21 52q-5-14-3-26M37 53q10-17 7-37" stroke="#3a9153" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M29 44Q11 41 16 31q11 0 13 13M27 30Q13 23 18 13q13 4 9 17M29 20Q41 16 36 4q-11 3-7 16M29 45q18-4 14-15-13 1-14 15M40 34q14-5 10-15-10 2-10 15M20 47Q7 43 10 34q10 0 10 13" fill="#53b767" />
          <path d="M29 31q12-5 10-15-10 2-10 15" fill="#7ac56d" />
        </svg>
      );
    case "arch":
      return (
        <svg {...p}>
          {sand}
          <path d="M9 52V35a21 21 0 0 1 42 0v17H40V35a10 10 0 0 0-20 0v17z" fill="#ee8eae" stroke="#ce668e" strokeWidth="2" />
          <path d="M12 35l-6-8M16 24l-1-9M28 16l3-9M41 23l5-8M47 35l7-7" stroke="#ee8eae" strokeWidth="6" strokeLinecap="round" />
          {[[13, 43], [17, 30], [28, 21], [38, 28], [46, 43]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="2" fill="#ffd0df" />)}
        </svg>
      );
    case "cave":
      return (
        <svg {...p}>
          {sand}
          <path d="M6 53l4-21 12-13 15-1 15 16 3 19z" fill="#8b96a0" stroke="#5d6b78" strokeWidth="2" strokeLinejoin="round" />
          <path d="M18 53V40q0-15 12-15t12 15v13z" fill="#374b5a" />
          <path d="M23 53V41q0-9 7-10" fill="none" stroke="#263a48" strokeWidth="3" />
          <path d="M11 32l10 3 3-12M40 23l-3 10 12 4" stroke="#b6bec2" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "driftwood":
      return (
        <svg {...p}>
          {sand}
          <path d="M9 49l38-11 7 6-4 9-38 3z" fill="#9b6c42" stroke="#704d32" strokeWidth="2" strokeLinejoin="round" />
          <path d="M24 46l-5-16 6-4 8 17M37 42l5-15 5-1-2 16" fill="#a77a4e" stroke="#704d32" strokeWidth="2" strokeLinejoin="round" />
          <path d="M15 50l31-8M22 53l21-6" stroke="#c09565" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="49" cy="47" rx="4" ry="6" fill="#d5ad78" transform="rotate(22 49 47)" />
        </svg>
      );
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
    case "starfish": {
      const c = variant === "yellow" ? "#ffd23f" : "#ff7fae";
      const pts = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 ? 9 : 20;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        return `${30 + Math.cos(a) * r},${36 + Math.sin(a) * r}`;
      }).join(" ");
      return (
        <svg {...p}>
          {sand}
          <polygon points={pts} fill={c} stroke="#00000022" strokeWidth="1.5" />
        </svg>
      );
    }
    case "castle": {
      const big = variant !== "small";
      return (
        <svg {...p}>
          {sand}
          <g transform={big ? undefined : "translate(10 18) scale(0.66)"}>
            <rect x="14" y="32" width="32" height="20" fill="#e9cf8f" />
            <rect x="10" y="22" width="9" height="30" fill="#e9cf8f" />
            <rect x="41" y="22" width="9" height="30" fill="#e9cf8f" />
            <rect x="25" y="16" width="10" height="36" fill="#e9cf8f" />
            <path d="M9 22l5.5-8 5.5 8zM40 22l5.5-8 5.5 8zM24 16l6-9 6 9z" fill="#ff8a5f" />
            <rect x="27" y="42" width="6" height="10" fill="#8a5a33" />
          </g>
        </svg>
      );
    }
    case "anemone":
      return (
        <svg {...p}>
          {sand}
          <rect x="20" y="40" width="20" height="12" rx="4" fill="#7b3fbf" />
          {[14, 20, 26, 32, 38, 44].map((x, i) => (
            <path key={x} d={`M${x + 2} 42q${i % 2 ? 4 : -4} -12 0 -24`} stroke="#b57bff" strokeWidth="4" fill="none" strokeLinecap="round" />
          ))}
        </svg>
      );
    case "shipwreck":
      return (
        <svg {...p}>
          {sand}
          <path d="M6 44l8 10h34l8-14z" fill="#7a4f2a" transform="rotate(-8 30 48)" />
          <path d="M30 44V14" stroke="#7a4f2a" strokeWidth="3" transform="rotate(14 30 44)" />
          <path d="M33 18h12l-2 6H33z" fill="#f4f1e8" transform="rotate(14 30 44)" />
          <circle cx="22" cy="48" r="2" fill="#3b2a1a" />
          <circle cx="32" cy="47" r="2" fill="#3b2a1a" />
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

/** A shared silhouette for shop offers, habitat chips and remodel previews. */
export function TankPicture({ type, size = 92 }: { type: TankType | "gallery" | "hall" | "tickets"; size?: number }) {
  const p = { width: size, height: size * 0.78, viewBox: "0 0 100 78", "aria-hidden": true } as const;
  if (type === "gallery") return <GalleryPicture size={size} />;
  if (type === "hall")
    return (
      <svg {...p}>
        <path d="M9 70V17L50 5l41 12v53z" fill="#246eae" stroke="#18507e" strokeWidth="2" />
        <path d="M9 23q10-8 20 0t20 0 20 0 22 0" stroke="#85d7ec" strokeWidth="4" fill="none" />
        <path d="M30 70V34h40v36" fill="#bcecff" stroke="#18507e" strokeWidth="3" />
        <path d="M50 35v35" stroke="#fff" strokeWidth="2" />
        <circle cx="44" cy="53" r="2" fill="#e6bd62" /><circle cx="56" cy="53" r="2" fill="#e6bd62" />
      </svg>
    );
  if (type === "tickets")
    return (
      <svg {...p}>
        <path d="M14 70V18h72v52" fill="#e6c28c" stroke="#aa7840" strokeWidth="2" />
        <path d="M10 10h80v17H10z" fill="#269bab" stroke="#177183" strokeWidth="2" />
        <rect x="23" y="35" width="23" height="35" rx="2" fill="#66513e" />
        <rect x="55" y="35" width="22" height="16" rx="2" fill="#c1edee" />
        <path d="M25 16h50" stroke="#fff3c2" strokeWidth="3" strokeLinecap="round" />
        <path d="M51 59h30M61 53v17" stroke="#e9b63b" strokeWidth="5" strokeLinecap="round" />
      </svg>
    );
  if (type === "cylinder")
    return (
      <svg {...p}>
        <ellipse cx="50" cy="72" rx="24" ry="4" fill="#234c6240" />
        <path d="M27 59v10q23 10 46 0V59" fill="#936944" stroke="#705039" strokeWidth="2" />
        <path d="M27 14v46q23 10 46 0V14" fill="#79d1ed" stroke="#3e9bbc" strokeWidth="2" />
        <path d="M29 55q21 8 42 0v5q-21 9-42 0z" fill="#ead6a4" />
        <ellipse cx="50" cy="14" rx="23" ry="7" fill="#b6ebf7" stroke="#3e9bbc" strokeWidth="2" />
        <path d="M26 10q24-9 48 0" fill="none" stroke="#9b84d9" strokeWidth="4" strokeLinecap="round" />
        <path d="M34 22v27M65 21v15" stroke="#fff" strokeWidth="3" opacity="0.65" strokeLinecap="round" />
        <path d="M44 37a7 7 0 0 1 14 0zM46 38q-3 6 0 10M51 38v11M56 38q3 6 0 10" fill="#eadbff" stroke="#b69ae1" strokeWidth="1.5" />
      </svg>
    );
  if (type === "hex")
    return (
      <svg {...p}>
        <path d="M18 58l16-9h32l16 9v10l-16 7H34l-16-7z" fill="#a9784a" stroke="#795331" strokeWidth="2" />
        <path d="M18 19l16-9h32l16 9v39l-16 9H34l-16-9z" fill="#77cfe9" stroke="#3c9eb8" strokeWidth="2" />
        <path d="M20 53l15-7h30l15 7v5l-15 8H35l-15-8z" fill="#ebd7a5" />
        <path d="M18 19l16 9h32l16-9M34 28v39M66 28v39" stroke="#c4f2fa" strokeWidth="2" fill="none" />
        <path d="M18 19l16-9h32l16 9-16 9H34z" fill="#c8f0f8" fillOpacity="0.7" stroke="#3c9eb8" strokeWidth="2" />
        <path d="M41 35v18M73 29v14" stroke="#fff" strokeWidth="3" opacity="0.65" strokeLinecap="round" />
      </svg>
    );
  const tall = type === "tall";
  const small = type === "small";
  const x = tall ? 31 : small ? 20 : 8;
  const y = tall ? 8 : small ? 22 : 17;
  const w = 100 - x * 2;
  const bow = type === "panorama";
  return (
    <svg {...p}>
      <path d={`M${x} 61h${w}v10H${x}z`} fill="#a9784a" stroke="#795331" strokeWidth="2" />
      <path d={`M${x} ${y}h${w}v${61 - y}${bow ? `q${-w / 2} 15 ${-w} 0` : `H${x}`}z`} fill="#79d1ed" stroke="#3e9bbc" strokeWidth="2" />
      <path d={bow ? `M${x + 2} 53q${w / 2 - 2} 13 ${w - 4} 0v7q${-w / 2 + 2} 14 ${-w + 4} 0z` : `M${x + 2} 55h${w - 4}v7H${x + 2}z`} fill="#ebd7a5" />
      {type === "cave" && <g><path d="M14 55V37l9-11 13 6 9-8 15 5 9-4 15 15v15z" fill="#85929d" stroke="#64717c" strokeWidth="1.5" /><path d="M23 55V45a8 8 0 0 1 16 0v10M49 47V38a7 7 0 0 1 14 0v9M66 55v-9a6 6 0 0 1 12 0v9" fill="#354d5c" /></g>}
      <path d={`M${x} ${y}l7-6h${w - 7}v6z`} fill="#c6edf5" stroke="#3e9bbc" strokeWidth="2" />
      <path d={`M${x + 7} ${y + 7}v${tall ? 33 : 20}M${100 - x - 7} ${y + 6}v10`} stroke="#fff" strokeWidth="3" opacity="0.7" strokeLinecap="round" />
      {bow && <path d={`M${x} 61q${w / 2} 14 ${w} 0`} stroke="#795331" strokeWidth="2" fill="none" />}
    </svg>
  );
}

export function GalleryPicture({ size = 92 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.78} viewBox="0 0 100 78" aria-hidden>
      <path d="M8 70V16L50 5l42 11v54z" fill="#4b477f" stroke="#37325f" strokeWidth="2" />
      <path d="M8 20q42-11 84 0" fill="none" stroke="#c1a7e9" strokeWidth="3" />
      {[25, 50, 75].map((x, i) => <g key={x}><path d={`M${x - 9} 33v28q9 5 18 0V33`} fill={i === 1 ? "#b395e4" : "#76bbdd"} stroke="#d1e5ff" strokeWidth="1.5" /><ellipse cx={x} cy="33" rx="9" ry="3" fill="#d8e3fa" /><path d={`M${x - 5} 47a5 5 0 0 1 10 0zM${x - 3} 48v7M${x + 2} 48v7`} fill="#f6e4ff" stroke="#f6e4ff" strokeWidth="1.5" /><path d={`M${x - 10} 65h20`} stroke="#a589ca" strokeWidth="4" strokeLinecap="round" /></g>)}
      <path d="M16 71h68" stroke="#b9a4d5" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
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
  grandma: { shirt: "#c77dff", hair: "#d9d9d9" },
  explorer: { shirt: "#c9a66b", hair: "#3b2a1a", hat: "#e9d8a6" },
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
      {type === "grandma" && (
        <g>
          <circle cx="30" cy="12" r="6" fill={c.hair} />
          <circle cx="25" cy="29" r="4" fill="none" stroke="#5a4632" strokeWidth="1.5" />
          <circle cx="35" cy="29" r="4" fill="none" stroke="#5a4632" strokeWidth="1.5" />
        </g>
      )}
      {type === "explorer" && <path d="M8 22h44c0-4-6-5-8-5-2-8-26-8-28 0-2 0-8 1-8 5z" fill={c.hat} stroke="#6b5a3e" strokeWidth="1.5" />}
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
  if (by in SPECIES)
    return (
      <span className="face-fish" style={{ width: size, height: size }}>
        <FishPicture species={by as SpeciesId} size={size * 0.9} />
      </span>
    );
  return <PersonFace type={by as VisitorType} size={size} />;
}

/** The lamp upgrade (what jellyfish like). */
export function LampPicture({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path d="M8 14h32l-4 8H12z" fill="#24313d" />
      <rect x="11" y="20" width="26" height="4" rx="2" fill="#fff3b0" />
      <path d="M12 26l-6 16M24 26v16M36 26l6 16" stroke="#ffe58a" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}
