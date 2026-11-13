import { useEffect, useRef, useState } from "react";
import { canNameAnimal, saveSelectedAnimalName, type NamingArea } from "../game/flow/animalNames";
import { animalName } from "../game/logic/animalNames";
import { setGame, useGame } from "../game/store";
import "./AnimalNamePanel.css";

function NameInput({ name, onClose }: { name: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(name);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    input.current?.focus();
    input.current?.select();
    return () => element?.close();
  }, []);
  const save = (value: string) => { saveSelectedAnimalName(value); onClose(); };
  return (
    <dialog ref={dialog} className="animal-name-dialog panel ui" aria-labelledby="animal-name-title"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
      }}
      onCancel={(event) => { event.preventDefault(); onClose(); }} data-testid="animal-name-dialog">
      <form onSubmit={(event) => { event.preventDefault(); save(draft); }}>
        <h2 id="animal-name-title">Name / なまえ</h2>
        <label htmlFor="animal-name-input">Your animal’s name / なまえ</label>
        <input ref={input} id="animal-name-input" data-testid="animal-name-input" value={draft}
          onChange={(event) => setDraft(event.target.value)} aria-describedby="animal-name-help"
          autoComplete="off" enterKeyHint="done" />
        <p id="animal-name-help">1–12 characters / 1〜12もじ<br />Japanese, letters, numbers, spaces, - and '.</p>
        <div className="animal-name-actions">
          <button className="primary" type="submit" data-testid="animal-name-save">OK</button>
          <button className="secondary" type="button" onClick={onClose}>Cancel / やめる</button>
        </div>
        <button className="secondary animal-name-default" type="button" onClick={() => save("")}
          data-testid="animal-name-default">Default name / もとの なまえ</button>
      </form>
    </dialog>
  );
}

function SelectedAnimal({ area, id }: { area: NamingArea; id: string }) {
  const name = useGame((s) => animalName(s.model, area, id));
  const [editing, setEditing] = useState(false);
  const nameButton = useRef<HTMLButtonElement>(null);
  const close = () => { setEditing(false); nameButton.current?.focus(); };
  return (
    <section className="animal-name-panel panel ui" aria-label="Selected animal" data-testid="animal-name-panel" data-animal-id={id}>
      <small>{area === "coast" ? "Penguin / ペンギン" : "Dolphin / イルカ"}</small>
      <div><strong data-testid="animal-selected-name">{name}</strong>
        <button className="secondary" ref={nameButton} onClick={() => setEditing(true)} data-testid="animal-name-open">Name / なまえ</button>
        <button className="secondary animal-name-close" aria-label="Close animal info" onClick={() => setGame({ animalSelection: null })}>×</button>
      </div>
      {editing && <NameInput name={name} onClose={close} />}
    </section>
  );
}

export function AnimalNamePanel({ area }: { area: NamingArea }) {
  const selected = useGame((s) => s.animalSelection);
  const free = useGame((s) => canNameAnimal(area, s));
  useEffect(() => () => { setGame({ animalSelection: null }); }, []);
  if (!free || selected?.area !== area) return null;
  return <SelectedAnimal key={selected.id} area={area} id={selected.id} />;
}
