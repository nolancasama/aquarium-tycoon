import { Icon } from "./icons";
import { Ja } from "./Ja";

export type ActionKind = "say" | "tap" | "look";

/** One visual vocabulary for speaking, tapping and looking instructions. */
export function ActionTag({ kind, en, ja, secondary = false, className = "" }: {
  kind: ActionKind;
  en: string;
  ja?: string;
  secondary?: boolean;
  className?: string;
}) {
  return (
    <span className={`action-tag action-${kind} ${secondary ? "secondary" : ""} ${className}`} data-action={kind}>
      <Icon id={kind === "say" ? "mic" : kind === "tap" ? "hand" : "eye"} size={secondary ? 19 : 28} />
      <span className="action-copy"><strong>{en}</strong><Ja>{ja}</Ja></span>
    </span>
  );
}
