import type { ReactNode } from "react";
import { useGame } from "../game/store";

/** Optional Japanese instructions, controlled by the existing teacher setting. */
export function Ja({ children }: { children: ReactNode }) {
  const on = useGame((s) => s.settings.japanese);
  if (!on || !children) return null;
  return <small className="ja" lang="ja">{children}</small>;
}
