import { useEffect, useRef, useState } from "react";
import { setGame, useGame } from "../game/store";
import { previewActive } from "../game/flow/preview";
import { restoreSaveSnapshot } from "../game/flow/story";
import { readBackups, readLastGood, readPreRepair, readRawSave, summarizeSave, type SaveSummary } from "../game/logic/backup";
import { decodeSaveReport, SAVE_KEY } from "../game/logic/save";
import { Ja } from "./Ja";
import "./SaveRecovery.css";

interface Snapshot {
  label: string;
  source: "current" | "lastgood" | "prerepair" | "backup" | "import";
  at: string | null;
  raw: string;
  summary: SaveSummary;
}

function snapshots(): Snapshot[] {
  const current = readRawSave();
  const good = readLastGood();
  return [
    ...(current !== null ? [{ label: "Current save", source: "current" as const, at: null, raw: current, summary: summarizeSave(current) }] : []),
    ...(good ? [{ ...good, label: "Last known good", source: "lastgood" as const }] : []),
    ...readPreRepair().map((entry, i) => ({ ...entry, label: `Pre-repair copy ${i + 1}`, source: "prerepair" as const })),
    ...readBackups().map((entry, i) => ({ ...entry, label: `Backup ${i + 1}`, source: "backup" as const }))
  ];
}

function dateLabel(at: string | null): string {
  if (!at) return "Date unavailable";
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

function Summary({ summary }: { summary: SaveSummary }) {
  return <p className="save-summary">
    <span>{summary.coins ?? "?"} coins</span><span>Level {summary.stage ?? "?"}</span>
    <span>{summary.tanks} tanks</span><span>{summary.fish} fish</span><span>{summary.decor} decorations</span>
  </p>;
}

function recordLabel(raw: unknown): string {
  if (typeof raw !== "object" || raw === null) return String(raw);
  return ["id", "slot", "type", "species", "kind"].flatMap((key) => {
    const value = (raw as Record<string, unknown>)[key];
    return typeof value === "string" || typeof value === "number" ? [`${key}: ${value}`] : [];
  }).join(" · ");
}

function Inspection({ snapshot }: { snapshot: Snapshot }) {
  const { data, report } = decodeSaveReport(snapshot.raw);
  const seen = new Set<string>();
  const records = [
    ...report.rejected.map((entry) => ({ reason: entry.reason, raw: entry.raw })),
    ...(data?.model.quarantine ?? [])
  ].filter((entry) => {
    const key = JSON.stringify(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return <div data-testid="save-inspect">
    <h3>{snapshot.label}</h3>
    <Summary summary={snapshot.summary} />
    {!data && <p role="status">This save cannot be read. {report.error}<Ja>このセーブは よみこめません。</Ja></p>}
    {snapshot.summary.rooms.map((room) => <section className="save-room" key={room.room}>
      <h4>{room.room}</h4>
      <table><thead><tr><th>Slot</th><th>Tank</th><th>Animals</th><th>Decorations</th></tr></thead>
        <tbody>{room.tanks.map((tank, index) => <tr key={`${tank.slot}-${index}`}>
          <td>{tank.slot}</td><td>{tank.type}</td><td>{tank.animals.join(", ") || "None"}</td><td>{tank.decor}</td>
        </tr>)}</tbody>
      </table>
    </section>)}
    <section className="save-diagnostics">
      <h4>Rejected / quarantined records <Ja>よみこまずに ほぞんした きろく</Ja></h4>
      {records.length === 0 ? <p>None</p> : <ul>{records.map((entry, index) => <li key={index} data-testid="save-rejected-record" data-reason={entry.reason}>
        <b>{entry.reason}</b><p>{recordLabel(entry.raw)}</p><details><summary>Original record</summary><pre>{JSON.stringify(entry.raw, null, 2)}</pre></details>
      </li>)}</ul>}
      {report.synthesizedTanks.length > 0 && <><h4>Synthesized tanks</h4><ul>{report.synthesizedTanks.map((tank, index) => <li key={index}>{tank.slot}: {tank.type} — {tank.why}</li>)}</ul></>}
    </section>
  </div>;
}

function RecoveryDialog() {
  const [entries] = useState(snapshots);
  const [selected, setSelected] = useState<Snapshot | null>(entries[0] ?? null);
  const [pending, setPending] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState("");
  const close = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const dismiss = () => setGame({ saveRecoveryOpen: false });
  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGame({ saveRecoveryOpen: false });
      if (event.key === "Tab") {
        const targets = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input, summary") ?? []);
        const target = event.shiftKey ? targets.at(-1) : targets[0];
        if (target && (event.shiftKey ? document.activeElement === targets[0] : document.activeElement === targets.at(-1))) {
          event.preventDefault();
          target.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const prepare = (entry: Snapshot) => {
    if (previewActive()) {
      setMessage("End the development preview before restoring or importing a save.");
      return;
    }
    setSelected(entry);
    setMessage("");
    setPending(entry);
  };
  const restore = () => {
    if (!pending) return;
    const result = restoreSaveSnapshot(pending.raw, pending.source === "import" ? "before-import" : "before-restore");
    if (result.ok) dismiss();
    else setMessage(result.message);
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (previewActive()) {
      setMessage("End the development preview before restoring or importing a save.");
      return;
    }
    try {
      const text = await file.text();
      const json: unknown = JSON.parse(text);
      const raw = typeof json === "object" && json !== null && "raw" in json && typeof json.raw === "string" ? json.raw : text;
      const decoded = decodeSaveReport(raw);
      if (!decoded.data) {
        setMessage(`Import cannot be read. ${decoded.report.error ?? "Choose an Aquarium Tycoon save JSON file."}`);
        setPending(null);
        return;
      }
      prepare({ label: `Import: ${file.name}`, source: "import", at: null, raw, summary: summarizeSave(raw) });
    } catch {
      setPending(null);
      setMessage("Import failed. Choose a readable Aquarium Tycoon save JSON file.");
    }
  };
  const exportCurrent = () => {
    const raw = readRawSave();
    if (raw === null) {
      setMessage("There is no current save to export.");
      return;
    }
    try {
      const exportedAt = new Date().toISOString();
      const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt, key: SAVE_KEY, raw }, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `aquarium-tycoon-save-${exportedAt.slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setMessage("Export could not be downloaded on this device.");
    }
  };
  const anyValid = entries.some((entry) => decodeSaveReport(entry.raw).data !== null);
  return <div className="save-recovery-back ui">
    <section ref={dialog} className="save-recovery" role="dialog" aria-modal="true" aria-labelledby="save-recovery-heading" data-testid="save-recovery">
      <header className="save-recovery-header">
        <div><h2 id="save-recovery-heading">Save Recovery <Ja>セーブの ふくげん</Ja></h2><p>For teachers <Ja>せんせい・おとなのかたへ</Ja></p></div>
        <button ref={close} className="secondary" onClick={dismiss} data-testid="save-recovery-close">Close <Ja>とじる</Ja></button>
      </header>
      <div className="save-recovery-tools">
        <button className="secondary" onClick={exportCurrent} data-testid="save-export">Export current JSON <Ja>いまの セーブを かきだす</Ja></button>
        <label className="save-import">Import JSON <Ja>ファイルから よみこむ</Ja><input type="file" accept=".json,application/json" data-testid="save-import" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
      </div>
      <p className="save-export-note">Export keeps the exact original save in the JSON “raw” field, with its key and export date.<Ja>もとの セーブを そのまま ファイルに のこします。</Ja></p>
      {message && <p className="save-recovery-message" role="status">{message}<Ja>メッセージを かくにんしてください。</Ja></p>}
      {!anyValid && <p className="save-recovery-message" role="status">No readable save exists here. Exact recovery is not possible without a valid backup or import.<Ja>よめる セーブが ありません。ふくげんには バックアップが ひつようです。</Ja></p>}
      <div className="save-recovery-body">
        <div className="save-snapshot-list" aria-label="Saved snapshots">
          {entries.length === 0 && <p>No saved snapshots. <Ja>セーブが ありません。</Ja></p>}
          {entries.map((entry, index) => <article className="save-snapshot" key={`${entry.source}-${index}`} data-testid="save-snapshot" data-source={entry.source} data-tanks={entry.summary.tanks} data-fish={entry.summary.fish} data-decor={entry.summary.decor}>
            <h3>{entry.label}</h3><time dateTime={entry.at ?? undefined}>{dateLabel(entry.at)}</time><Summary summary={entry.summary} />
            <div className="save-snapshot-actions"><button className="secondary" onClick={() => { setSelected(entry); setPending(null); }}>Inspect <Ja>なかみを みる</Ja></button>
              <button className="secondary" disabled={!decodeSaveReport(entry.raw).data} onClick={() => prepare(entry)}>Restore <Ja>ふくげん</Ja></button></div>
          </article>)}
        </div>
        <div className="save-inspector">
          {pending && <section className="save-confirm" data-testid="save-restore-confirmation" role="group" aria-label="Confirm save replacement">
            <h3>{pending.source === "import" ? "Import this save?" : "Restore this save?"}</h3>
            <p>This replaces the whole current save and returns to the title. The current save is backed up first. Saves are never merged.<Ja>いまの セーブを バックアップしてから、ぜんぶを この セーブに おきかえます。</Ja></p>
            <div className="save-snapshot-actions"><button className="primary" data-testid="save-confirm-restore" onClick={restore}>Confirm {pending.source === "import" ? "import" : "restore"}<Ja>おきかえる</Ja></button><button className="secondary" onClick={() => setPending(null)}>Cancel <Ja>やめる</Ja></button></div>
          </section>}
          {selected ? <Inspection snapshot={selected} /> : <p>Select a save to inspect it.</p>}
        </div>
      </div>
    </section>
  </div>;
}

export function SaveRecovery() {
  const open = useGame((state) => state.saveRecoveryOpen);
  return open ? <RecoveryDialog /> : null;
}
