import { saveSettings, setGame, useGame } from "../game/store";
import { closeStageCard, continueGame, keepPlaying, newGame, toTitle } from "../game/flow/story";
import { PHRASES } from "../game/logic/english";
import { fishCount } from "../game/logic/model";
import { audio } from "../audio/audio";
import { Icon } from "./icons";
import { DecorPicture, FishPicture, PersonFace, PicoFace } from "./Portraits";
import { Ja } from "./Talk";
import { REWARD_TEXT, STAGE_NAMES } from "./i18n";

function ModeSwitch() {
  const s = useGame((st) => st.settings);
  const set = (mic: boolean) => {
    const next = { ...s, mic };
    saveSettings(next);
    setGame({ settings: next });
    audio.unlock();
    audio.play("tick");
  };
  return (
    <div className="mode-switch" role="radiogroup" aria-label="Answer mode">
      <button className={s.mic ? "on" : ""} onClick={() => set(true)} role="radio" aria-checked={s.mic} data-testid="mode-speak">
        <Icon id="mic" size={26} /> Speak <Ja>はなす</Ja>
      </button>
      <button className={!s.mic ? "on" : ""} onClick={() => set(false)} role="radio" aria-checked={!s.mic} data-testid="mode-tap">
        <Icon id="check" size={24} /> Tap <Ja>タップ</Ja>
      </button>
    </div>
  );
}

export function TitleScreen() {
  const screen = useGame((s) => s.screen);
  const hasSave = useGame((s) => s.hasSave);
  const confirm = useGame((s) => s.confirmNew);
  const lost = useGame((s) => s.saveLost);
  if (screen !== "title") return null;
  return (
    <div className="title-screen ui" data-testid="title">
      <div className="title-card panel">
        <div className="logo">
          <FishPicture species="clownfish" size={86} />
          <h1>
            <span>AQUARIUM</span>
            <span>TYCOON</span>
          </h1>
          <FishPicture species="bluetang" size={86} />
        </div>
        <p className="subtitle" lang="ja">
          すいぞくかんを つくろう!
        </p>
        {lost && (
          <p className="note" data-testid="save-lost">
            The old save could not be read. <Ja>まえの セーブが よめなかったので、はじめからに なります</Ja>
          </p>
        )}
        {!confirm ? (
          <div className="title-buttons">
            {hasSave && (
              <button className="primary big" onClick={() => void continueGame()} data-testid="btn-continue">
                ▶ Continue <Ja>つづきから</Ja>
              </button>
            )}
            <button
              className={hasSave ? "secondary big" : "primary big"}
              onClick={() => {
                audio.unlock();
                if (hasSave) setGame({ confirmNew: true });
                else void newGame();
              }}
              data-testid="btn-new"
            >
              ★ New game <Ja>はじめから</Ja>
            </button>
          </div>
        ) : (
          <div className="confirm" data-testid="confirm-new">
            <p>
              Start again? <Ja>はじめから? いまの すいぞくかんは きえるよ</Ja>
            </p>
            <div className="title-buttons">
              <button className="primary big" onClick={() => void newGame()} data-testid="btn-confirm-new">
                <Icon id="check" size={24} /> Yes
              </button>
              <button className="secondary big" onClick={() => setGame({ confirmNew: false })} data-testid="btn-cancel-new">
                <Icon id="close" size={20} /> No
              </button>
            </div>
          </div>
        )}
        <ModeSwitch />
        <button className="link" onClick={() => setGame({ settingsOpen: true })} data-testid="btn-title-settings">
          <Icon id="gear" size={22} /> Settings <Ja>せってい</Ja>
        </button>
      </div>
    </div>
  );
}

export function StageCardModal() {
  const card = useGame((s) => s.stageCard);
  if (!card) return null;
  const name = STAGE_NAMES[card.stage];
  const reward = REWARD_TEXT[card.reward];
  return (
    <div className="modal-back ui">
      <div className="panel stage-card" data-testid="stage-card" role="dialog">
        <div className="burst">
          <Icon id="star" size={64} />
        </div>
        <h2>
          Level {card.stage} clear!
          <Ja>レベル{card.stage} クリア!</Ja>
        </h2>
        <p className="stage-name">{name.en}</p>
        <div className="reward">
          {card.reward === "decor" && (
            <>
              <DecorPicture kind="plant" variant="small" size={70} />
              <DecorPicture kind="shell" size={70} />
            </>
          )}
          {card.reward === "yellow" && <FishPicture species="yellowfish" size={110} />}
          {card.reward === "tank" && <Icon id="tank" size={96} />}
          {card.reward === "special" && <PersonFace type="fan" size={84} />}
          <span className="reward-text">
            {reward.en}
            <Ja>{reward.ja}</Ja>
          </span>
        </div>
        <button className="primary big" onClick={() => closeStageCard()} data-testid="stage-ok">
          <Icon id="check" size={26} /> OK
        </button>
      </div>
    </div>
  );
}

export function ResultsScreen() {
  const screen = useGame((s) => s.screen);
  const model = useGame((s) => s.model);
  if (screen !== "results") return null;
  const said = model.progress.said.map((id) => PHRASES[id].en);
  return (
    <div className="results-screen ui" data-testid="results">
      <div className="panel results-card">
        <div className="trophy">
          <Icon id="trophy" size={96} />
        </div>
        <h1>
          Aquarium Star!
          <Ja>アクアリウム スター!</Ja>
        </h1>
        <div className="stats">
          <div className="stat" data-testid="stat-fish">
            <Icon id="fish" size={34} />
            <b>{fishCount(model)}</b>
          </div>
          <div className="stat" data-testid="stat-helped">
            <Icon id="heart" size={34} />
            <b>{model.progress.hearts}</b>
          </div>
          <div className="stat" data-testid="stat-coins">
            <Icon id="coin" size={34} />
            <b>{model.stats.coinsEarned}</b>
          </div>
        </div>
        {said.length > 0 && (
          <div className="said" data-testid="results-said">
            <h3>
              <PicoFace size={36} /> You said: <Ja>いった えいご</Ja>
            </h3>
            <ul>
              {said.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="title-buttons">
          <button className="primary big" onClick={() => keepPlaying()} data-testid="btn-keep-playing">
            ▶ Keep playing <Ja>あそびつづける</Ja>
          </button>
          <button className="secondary" onClick={() => toTitle()} data-testid="btn-results-title">
            Title <Ja>タイトル</Ja>
          </button>
        </div>
      </div>
    </div>
  );
}
