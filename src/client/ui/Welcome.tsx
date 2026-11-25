import { useState } from "react";
import { connection } from "../network/store";
import { asset } from "./Art";
export function Welcome() {
  const [name, setName] = useState(""),
    [step, setStep] = useState(0),
    [gender, setGender] = useState<"male" | "female">("male"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function next() {
    setBusy(true);
    setError("");
    try {
      if (!step) {
        const r = await fetch(`/api/name?name=${encodeURIComponent(name)}`),
          data = (await r.json()) as { available?: boolean; error?: string };
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
    <main
      className="welcome"
      style={{
        backgroundImage: `linear-gradient(90deg,rgba(20,49,35,.25),rgba(20,49,35,.05)),url(${asset("world", "welcome")})`,
      }}
    >
      <div className="welcome-panel panel">
        <h1>물가마을</h1>
        {step === 0 ? (
          <>
            <label htmlFor="nickname">이름</label>
            <input
              id="nickname"
              autoFocus
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void next();
              }}
              autoComplete="off"
              placeholder="2~12자"
            />
            <p className="account-note">이름은 한 번 정하면 유지됩니다.</p>
          </>
        ) : (
          <>
            <h2>{name}</h2>
            <div className="characters">
              {(["male", "female"] as const).map((g) => (
                <button
                  key={g}
                  className={`character-choice ${gender === g ? "selected" : ""}`}
                  onClick={() => setGender(g)}
                  aria-pressed={gender === g}
                >
                  <img
                    src={asset("characters", `${g}_portrait`)}
                    alt={g === "male" ? "남자 캐릭터" : "여자 캐릭터"}
                  />
                  <span>{g === "male" ? "남자" : "여자"}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button
          className="primary wide"
          disabled={busy || name.length < 2}
          onClick={() => void next()}
        >
          {busy ? "확인 중" : step ? "게임 시작" : "다음"}
        </button>
        {step === 1 && (
          <button className="quiet" onClick={() => setStep(0)}>
            이름 바꾸기
          </button>
        )}
      </div>
    </main>
  );
}
