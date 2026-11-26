import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../shared/chat";
import { connection } from "../network/store";
import { asset } from "./Art";
export function Chat({
  messages,
  error,
  disabled,
  onFocusChange,
}: {
  messages: ChatMessage[];
  error: string | null;
  disabled: boolean;
  onFocusChange: (focused: boolean) => void;
}) {
  const [open, setOpen] = useState(false),
    [text, setText] = useState("");
  const field = useRef<HTMLInputElement>(null),
    composing = useRef(false);
  useEffect(() => {
    onFocusChange(open && !disabled);
    if (open && !disabled) field.current?.focus();
    return () => onFocusChange(false);
  }, [open, disabled, onFocusChange]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!open || e.key !== "Escape" || e.isComposing) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [open]);
  return (
    <section className={`chat-box ${open ? "is-open" : ""}`} aria-label="채팅">
      {!open && (
        <button
          className="chat-toggle"
          aria-label="채팅 열기"
          title="채팅 열기"
          onClick={() => setOpen(true)}
          disabled={disabled}
        >
          <img src={asset("redesign", "quick-chat")} alt="" />
        </button>
      )}
      {open && (
        <>
          <header className="chat-heading">
            <strong>채팅</strong>
            <button
              type="button"
              className="chat-close"
              aria-label="채팅 닫기"
              title="채팅 닫기 (Esc)"
              onClick={() => setOpen(false)}
            >
              <img src={asset("redesign", "quick-close")} alt="" />
            </button>
          </header>
          <div className="chat-log" role="log" aria-live="polite">
            {messages.slice(-4).map((m) => (
              <p key={m.id}>
                <strong>{m.name}</strong>
                <span>{m.text}</span>
              </p>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (composing.current || !text.trim()) return;
              if (connection.sendChat(text)) setText("");
            }}
          >
            <input
              ref={field}
              aria-label="채팅 메시지"
              maxLength={100}
              placeholder="한마디 남겨요"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={() => {
                composing.current = false;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.nativeEvent.isComposing)
                  e.preventDefault();
              }}
            />
            <button
              type="submit"
              className="primary"
              disabled={!text.trim() || disabled}
            >
              전송
            </button>
          </form>
          {error && (
            <p className="chat-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
