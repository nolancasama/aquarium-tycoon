/** Inline SVG icons (no icon fonts or files: school networks block downloads). */

export type IconId =
  | "coin"
  | "heart"
  | "star"
  | "gear"
  | "fish"
  | "food"
  | "sponge"
  | "decor"
  | "back"
  | "tank"
  | "mic"
  | "speaker"
  | "close"
  | "check"
  | "lock"
  | "bag"
  | "box"
  | "visitor"
  | "shop"
  | "happy"
  | "okay"
  | "sad"
  | "trophy"
  | "turtle"
  | "up"
  | "crown";

export function Icon({ id, size = 24, className }: { id: IconId; size?: number; className?: string }) {
  const p = { width: size, height: size, viewBox: "0 0 48 48", className, "aria-hidden": true } as const;
  switch (id) {
    case "coin":
      return (
        <svg {...p}>
          <circle cx="24" cy="24" r="20" fill="#ffc93c" stroke="#d18a00" strokeWidth="4" />
          <circle cx="18" cy="17" r="4" fill="#fff3b0" />
          <path d="M24 13l3.2 6.6 7.2 1-5.2 5 1.3 7.2L24 29.4l-6.5 3.4 1.3-7.2-5.2-5 7.2-1z" fill="#d18a00" />
        </svg>
      );
    case "heart":
      return (
        <svg {...p}>
          <path d="M24 41S6 30 6 18a9 9 0 0 1 18-3 9 9 0 0 1 18 3c0 12-18 23-18 23z" fill="#ff5c8a" stroke="#fff" strokeWidth="3" />
        </svg>
      );
    case "star":
      return (
        <svg {...p}>
          <path d="M24 4l5.9 12.4 13.6 1.7-10 9.4 2.6 13.5L24 34.4 11.9 41l2.6-13.5-10-9.4 13.6-1.7z" fill="#ffd23f" stroke="#e0a000" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      );
    case "gear":
      return (
        <svg {...p}>
          <path
            d="M20 4h8l1.4 5.2 4.3 2.5 5.2-1.5 4 6.9-3.8 3.8v5l3.8 3.8-4 6.9-5.2-1.5-4.3 2.5L28 44h-8l-1.4-5.2-4.3-2.5-5.2 1.5-4-6.9 3.8-3.8v-5L5.1 16.3l4-6.9 5.2 1.5 4.3-2.5z"
            fill="currentColor"
          />
          <circle cx="24" cy="24" r="7" fill="#fff" />
        </svg>
      );
    case "fish":
      return (
        <svg {...p}>
          <path d="M6 24c6-10 20-12 30-4l6-6v20l-6-6c-10 8-24 6-30-4z" fill="#ff8a3d" stroke="#c95a12" strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="15" cy="21" r="3" fill="#fff" />
          <circle cx="15.5" cy="21.5" r="1.6" fill="#123" />
          <path d="M22 15v18" stroke="#fff" strokeWidth="4" />
        </svg>
      );
    case "food":
      return (
        <svg {...p}>
          <rect x="13" y="14" width="22" height="28" rx="5" fill="#ff8a3d" />
          <rect x="11" y="8" width="26" height="8" rx="3" fill="#c95a12" />
          <circle cx="18" cy="11.5" r="1.6" fill="#ffe0a0" />
          <circle cx="24" cy="11.5" r="1.6" fill="#ffe0a0" />
          <circle cx="30" cy="11.5" r="1.6" fill="#ffe0a0" />
          <rect x="17" y="22" width="14" height="10" rx="3" fill="#fff3d6" />
          <circle cx="21" cy="27" r="2" fill="#c8692b" />
          <circle cx="27" cy="27" r="2" fill="#c8692b" />
        </svg>
      );
    case "sponge":
      return (
        <svg {...p}>
          <rect x="7" y="18" width="34" height="20" rx="6" fill="#ffe14a" />
          <rect x="7" y="31" width="34" height="7" rx="3" fill="#58c26a" />
          <circle cx="15" cy="24" r="2" fill="#e8c020" />
          <circle cx="25" cy="23" r="2.4" fill="#e8c020" />
          <circle cx="33" cy="25" r="1.8" fill="#e8c020" />
          <circle cx="14" cy="10" r="4" fill="none" stroke="#7cc8ff" strokeWidth="2.5" />
          <circle cx="26" cy="7" r="3" fill="none" stroke="#7cc8ff" strokeWidth="2.5" />
          <circle cx="35" cy="12" r="2.5" fill="none" stroke="#7cc8ff" strokeWidth="2.5" />
        </svg>
      );
    case "decor":
      return (
        <svg {...p}>
          <path d="M24 42c-2-10-10-14-14-26 6 4 10 8 12 14 0-10 2-18 6-24 1 8 0 16-2 24 3-6 8-10 14-12-4 8-10 14-14 24z" fill="#2fbf5a" />
          <ellipse cx="24" cy="42" rx="14" ry="3.5" fill="#e6cf94" />
        </svg>
      );
    case "back":
      return (
        <svg {...p}>
          <path d="M28 10L14 24l14 14" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "tank":
      return (
        <svg {...p}>
          <rect x="6" y="10" width="36" height="24" rx="3" fill="#5cc8ea" stroke="#1f4a66" strokeWidth="3" />
          <rect x="6" y="28" width="36" height="6" fill="#ecd9a4" />
          <rect x="9" y="34" width="30" height="8" rx="2" fill="#c58a55" />
          <path d="M14 20c3-4 8-4 11 0-3 4-8 4-11 0z" fill="#ff8a3d" />
          <path d="M25 20l3-3v6z" fill="#ff8a3d" />
        </svg>
      );
    case "mic":
      return (
        <svg {...p}>
          <rect x="17" y="5" width="14" height="24" rx="7" fill="currentColor" />
          <path d="M11 22a13 13 0 0 0 26 0" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <path d="M24 35v7m-7 0h14" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
    case "speaker":
      return (
        <svg {...p}>
          <path d="M8 18h8l10-9v30l-10-9H8z" fill="currentColor" />
          <path d="M32 16a10 10 0 0 1 0 16M36 10a17 17 0 0 1 0 28" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
    case "close":
      return (
        <svg {...p}>
          <path d="M12 12l24 24M36 12L12 36" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        </svg>
      );
    case "check":
      return (
        <svg {...p}>
          <path d="M9 25l10 10 20-22" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "lock":
      return (
        <svg {...p}>
          <path d="M15 21v-6a9 9 0 0 1 18 0v6" fill="none" stroke="currentColor" strokeWidth="5" />
          <rect x="10" y="20" width="28" height="22" rx="5" fill="currentColor" />
          <circle cx="24" cy="30" r="3.5" fill="#fff" />
        </svg>
      );
    case "bag":
      return (
        <svg {...p}>
          <path d="M14 8h20l-2 6c6 4 8 10 8 16 0 8-7 12-16 12S8 38 8 30c0-6 2-12 8-16z" fill="#bfeeff" stroke="#3a9cc4" strokeWidth="2.5" />
          <path d="M10 28c4-2 24-2 28 0v2c0 7-6 10-14 10s-14-3-14-10z" fill="#5cc8ea" />
          <path d="M18 31c3-3 7-3 10 0-3 3-7 3-10 0zM28 31l3-2.5v5z" fill="#ff8a3d" />
          <path d="M15 8h18" stroke="#ff5c8a" strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
    case "box":
      return (
        <svg {...p}>
          <path d="M6 16l18-8 18 8v20l-18 8-18-8z" fill="#d9a066" stroke="#8a5a2b" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M6 16l18 8 18-8M24 24v20" fill="none" stroke="#8a5a2b" strokeWidth="2.5" />
          <path d="M14 12l18 8" stroke="#f0d0a0" strokeWidth="4" />
        </svg>
      );
    case "visitor":
      return (
        <svg {...p}>
          <circle cx="24" cy="15" r="9" fill="#f6d2b0" />
          <path d="M15 12a9 9 0 0 1 18 0c-4-3-14-3-18 0z" fill="#3a2a1e" />
          <path d="M8 44c0-10 7-16 16-16s16 6 16 16z" fill="#4aa3ff" />
          <circle cx="38" cy="10" r="8" fill="#ffd23f" stroke="#b57a00" strokeWidth="2" />
          <path d="M38 5v6m0 3v1" stroke="#7a3b00" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "shop":
      return (
        <svg {...p}>
          <path d="M6 18l4-10h28l4 10z" fill="#ff8a3d" />
          <path d="M6 18c0 3 3 5 6 5s6-2 6-5c0 3 3 5 6 5s6-2 6-5c0 3 3 5 6 5s6-2 6-5" fill="#fff" stroke="#ff8a3d" strokeWidth="2" />
          <rect x="9" y="23" width="30" height="19" rx="2" fill="#fff" stroke="#3a9cc4" strokeWidth="2.5" />
          <rect x="21" y="30" width="8" height="12" fill="#5cc8ea" />
        </svg>
      );
    case "happy":
      return (
        <svg {...p}>
          <circle cx="24" cy="24" r="19" fill="#4cd27a" />
          <circle cx="17" cy="20" r="2.6" fill="#22313f" />
          <circle cx="31" cy="20" r="2.6" fill="#22313f" />
          <path d="M15 28a10 10 0 0 0 18 0" fill="none" stroke="#22313f" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      );
    case "okay":
      return (
        <svg {...p}>
          <circle cx="24" cy="24" r="19" fill="#ffcf3f" />
          <circle cx="17" cy="20" r="2.6" fill="#22313f" />
          <circle cx="31" cy="20" r="2.6" fill="#22313f" />
          <path d="M17 31h14" fill="none" stroke="#22313f" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      );
    case "sad":
      return (
        <svg {...p}>
          <circle cx="24" cy="24" r="19" fill="#6aa7ff" />
          <circle cx="17" cy="20" r="2.6" fill="#22313f" />
          <circle cx="31" cy="20" r="2.6" fill="#22313f" />
          <path d="M16 34a10 10 0 0 1 16 0" fill="none" stroke="#22313f" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      );
    case "turtle":
      return (
        <svg {...p}>
          <ellipse cx="14" cy="14" rx="9" ry="4" fill="#86c25a" transform="rotate(-30 14 14)" />
          <ellipse cx="14" cy="34" rx="9" ry="4" fill="#86c25a" transform="rotate(30 14 34)" />
          <ellipse cx="38" cy="24" rx="7" ry="6" fill="#9ccf6a" />
          <ellipse cx="22" cy="24" rx="16" ry="12" fill="#3f9b5b" />
          <path d="M22 12v24M12 18l20 12M12 30l20-12" stroke="#2e7d45" strokeWidth="2.5" />
          <circle cx="40" cy="22" r="1.8" fill="#15202b" />
        </svg>
      );
    case "up":
      return (
        <svg {...p}>
          <circle cx="24" cy="24" r="19" fill="#4cd27a" />
          <path d="M24 34V15M15 23l9-9 9 9" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "crown":
      return (
        <svg {...p}>
          <path d="M6 36l4-22 9 10 5-14 5 14 9-10 4 22z" fill="#ffc933" stroke="#c98a00" strokeWidth="2.5" strokeLinejoin="round" />
          <rect x="6" y="36" width="36" height="6" rx="2" fill="#c98a00" />
          <circle cx="24" cy="30" r="3" fill="#ff5c8a" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...p}>
          <path d="M14 6h20v10a10 10 0 0 1-20 0z" fill="#ffc933" stroke="#c98a00" strokeWidth="2.5" />
          <path d="M14 10H8c0 6 3 9 7 9M34 10h6c0 6-3 9-7 9" fill="none" stroke="#c98a00" strokeWidth="3" />
          <rect x="21" y="26" width="6" height="8" fill="#ffc933" />
          <rect x="14" y="34" width="20" height="8" rx="2" fill="#8a5a2b" />
          <path d="M24 9l1.8 3.7 4 .6-2.9 2.8.7 4L24 18.2l-3.6 1.9.7-4-2.9-2.8 4-.6z" fill="#fff07a" />
        </svg>
      );
  }
}
