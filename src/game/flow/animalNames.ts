import { keeperBusy } from "../coast/keeper";
import { COAST_HALL, LAGOON_HALL } from "../data/rooms";
import { renameAnimal } from "../logic/animalNames";
import { DOLPHINS } from "../logic/lagoon";
import { getGame, setGame, updateModel, useGame, type GameState } from "../store";

export type NamingArea = "coast" | "lagoon";

export function animalPresent(area: NamingArea, id: string, g: GameState = getGame()): boolean {
  return area === "lagoon" ? DOLPHINS.some((d) => d.id === id)
    : g.model.tanks.some((t) => t.type === "penguins" && t.fish.some((f) => f.id === id));
}

export function canNameAnimal(area: NamingArea, g: GameState = getGame()): boolean {
  return g.screen === "game" && g.hall === (area === "coast" ? COAST_HALL : LAGOON_HALL)
    && g.mode === "play" && g.fade === 0 && !g.prompt && !g.line && !g.request && !g.stageCard
    && !g.panel && !g.areaPanel && !g.placing && !g.settingsOpen && !g.saveRecoveryOpen
    && !g.mapOpen && !g.trophiesOpen && !g.coastActivity && !g.areaActivity
    && !g.coastRevealing && (area !== "coast" || !keeperBusy());
}

export function selectAnimal(area: NamingArea, id: string): boolean {
  const g = getGame();
  if (!canNameAnimal(area, g)) return false;
  if (!animalPresent(area, id, g)) return false;
  // The panel itself announces the name; a toast here sat on top of it.
  setGame({ animalSelection: { area, id } });
  return true;
}

export function saveSelectedAnimalName(input: string) {
  const selected = getGame().animalSelection;
  if (!selected || !canNameAnimal(selected.area)) return;
  updateModel((m) => renameAnimal(m, selected.area, selected.id, input));
}

// Session selection must not outlive travel, a restored preview snapshot, or the game.
useGame.subscribe((g, previous) => {
  if (g.animalSelection && (g.hall !== previous.hall || g.screen !== "game"
    || (previous.previewAreas.length > 0 && g.previewAreas.length === 0)
    || !animalPresent(g.animalSelection.area, g.animalSelection.id, g))) {
    setGame({ animalSelection: null });
  }
});
