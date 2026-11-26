import { useEffect, useState } from "react";
import { connection } from "../network/store";
import { asset } from "./Art";
export function Welcome() {
  const [name, setName] = useState(""),
    [step, setStep] = useState(0),
    [gender, setGender] = useState<"male" | "female">("male"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    setAvailable(null);
    if (step || name.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/name?name=${encodeURIComponent(name)}`, {
          signal: controller.signal,
        });
        const data = (await r.json()) as { available?: boolean };
        setAvailable(r.ok && !!data.available);
      } catch {
        /* next performs the authoritative check */
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [name, step]);
  async function next() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!step) {
        const r = await fetch(`/api/name?name=${encodeURIComponent(name)}`);
        const data = (await r.json()) as {
          available?: boolean;
          error?: string;
        };
        if (!r.ok || !data.available)
          throw Error(data.error || "이미 사용 중인 이름입니다.");
        setStep(1);
      } else await connection.register(name, gender);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={`welcome ${step ? "select-character" : "enter-name"}`}>
      {!step ? (
        <>
          <img
            className="welcome-logo"
            src={`${asset("redesign", "logo")}?brand=moyeo-20261126`}
            alt="모여라 낚시터"
          />
          <form
            className="welcome-panel panel"
            onSubmit={(e) => {
              e.preventDefault();
              void next();
            }}
          >
            <h1>
              <label htmlFor="nickname">이름 입력</label>
            </h1>
            <input
              id="nickname"
              autoFocus
              value={name}
              maxLength={24}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              autoComplete="off"
              placeholder="이름"
              aria-describedby="name-status"
            />
            <p
              id="name-status"
              className={`name-status ${available === false ? "error" : ""}`}
              aria-live="polite"
            >
              {error ||
                (available === true
                  ? "사용 가능한 이름"
                  : available === false
                    ? "사용할 수 없는 이름"
                    : "\u00a0")}
            </p>
            <button
              type="submit"
              className="primary wide"
              disabled={busy || name.trim().length < 2}
            >
              <span>{busy ? "확인 중" : "다음"}</span>
            </button>
          </form>
        </>
      ) : (
        <>
          <button
            className="onboarding-back"
            onClick={() => {
              setStep(0);
              setError("");
            }}
          >
            <span className="back-label">이전</span>
          </button>
          <header className="selection-heading">
            <h1>
              <img src={asset("equipment", "bobber")} alt="" />
              캐릭터 선택
            </h1>
            <h2 className="angler-nametag">
              <span title={name}>{name}</span>
            </h2>
          </header>
          <div className="characters">
            {(["male", "female"] as const).map((g) => (
              <button
                key={g}
                className={`character-choice ${gender === g ? "selected" : ""}`}
                onClick={() => setGender(g)}
                aria-pressed={gender === g}
                aria-label={g === "male" ? "남자 캐릭터" : "여자 캐릭터"}
              >
                <span className="character-stage">
                  <img
                    className="character-figure"
                    src={asset("characters", `${g}_portrait`)}
                    alt=""
                  />
                  <img
                    className="character-platform"
                    src={asset("redesign", "character-platform")}
                    alt=""
                  />
                  {gender === g && (
                    <img
                      className="character-check"
                      src={asset("redesign", "selection-check")}
                      alt="선택됨"
                    />
                  )}
                </span>
                <span className="character-label">
                  {g === "male" ? "남자" : "여자"}
                </span>
              </button>
            ))}
          </div>
          <div className="start-game">
            <button
              className="primary wide"
              disabled={busy}
              onClick={() => void next()}
            >
              <span>{busy ? "접속 중" : "게임 시작"}</span>
            </button>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
