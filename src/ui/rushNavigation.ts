import { backToRoom, leaveExplore, openTank, switchHall } from "../game/flow/actions";
import { HALL_OF } from "../game/data/tanks";
import { isWingHall } from "../game/data/rooms";
import { getGame, useGame, type GameState } from "../game/store";

/** Wait for the existing navigation transitions, with no separate clock. */
function whenReady(ready: (game: GameState) => boolean, action: () => void) {
  if (ready(getGame())) { action(); return; }
  const unsubscribe = useGame.subscribe((game) => {
    if (game.screen !== "game") { unsubscribe(); return; }
    if (!ready(game)) return;
    unsubscribe();
    action();
  });
}

/** Checklist taps travel only; care remains on the usual tank/habitat buttons. */
export function visitRushTank(id: string) {
  leaveExplore();
  whenReady((game) => !game.exploring && game.mode === "play", () => {
    const game = getGame();
    const tank = game.model.tanks.find((t) => t.id === id);
    if (!tank) return;
    const hall = HALL_OF[tank.slot];
    backToRoom();
    if (hall !== game.hall && (isWingHall(hall) || isWingHall(game.hall))) {
      switchHall(hall);
      whenReady((next) => next.hall === hall && next.fade === 0 && next.mode === "play", () => openTank(id));
    } else openTank(id);
  });
}
