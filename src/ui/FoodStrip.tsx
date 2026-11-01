import { useGame } from "../game/store";
import { FOOD } from "../game/data/food";
import { tasteFood } from "../game/flow/actions";
import { Ja } from "./Talk";

/** After a feed: which foods went in, in English. Optional, and it never blocks:
 * a tap only says the word and adds a little more of that food. */
export function FoodStrip() {
  const strip = useGame((s) => s.foodStrip);
  const shown = useGame((s) => s.foodStrip !== null && s.view === "tank" && s.tankId === s.foodStrip.tankId
    && !s.prompt && !s.line && !s.request && !s.stageCard && !s.settingsOpen && s.screen === "game");
  if (!strip || !shown) return null;
  return (
    <div className="food-strip ui" key={strip.id} data-testid="food-strip">
      {strip.foods.map((food) => (
        <button key={food} type="button" className="food-chip" data-testid={`food-${food}`} onClick={() => tasteFood(food)}>
          <span className="food-chip-icon" aria-hidden="true">{FOOD[food].icon}</span>
          <span className="food-chip-word">
            <span className="food-chip-en">{FOOD[food].en}</span>
            <Ja>{FOOD[food].ja}</Ja>
          </span>
        </button>
      ))}
    </div>
  );
}
