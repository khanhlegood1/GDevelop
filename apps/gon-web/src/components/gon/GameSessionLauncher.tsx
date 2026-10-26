"use client";

import { useState } from "react";
import { apiRequest, type AnyRecord } from "@/lib/api";
import {
  GAME_SESSION_OPEN_STATUSES,
  gameEventBatch,
} from "@/lib/gon-live-api";

export interface GameSessionLauncherProps {
  journeyId: string;
  nodeId: string;
  templateId: string;
  onNotice?: (message: string) => void;
}

/**
 * 🎮 GameSessionLauncher — Apply-3b (27/10): nối Journey Player vào
 * /v1 game-sessions thật (P03): tạo session + launchToken → gửi event
 * session_started → active; hoàn tất gửi question_answered +
 * checkpoint_reached + session_completed. Event batch idempotent theo
 * clientEventId (backend Apply-3). validatedLearningEffect hiển thị
 * null trung thực — rubric thật nằm ở VS sau.
 */
export function GameSessionLauncher({ journeyId, nodeId, templateId, onNotice }: GameSessionLauncherProps) {
  const [session, setSession] = useState<AnyRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const open = session ? GAME_SESSION_OPEN_STATUSES.has(String(session.status)) : false;

  async function start() {
    if (busy) return;
    setBusy(true);
    setError("");
    setSession(null);
    try {
      const created = await apiRequest<AnyRecord>(`/v1/journeys/${journeyId}/game-sessions`, {
        method: "POST",
        body: { nodeId, templateId },
      });
      const afterStart = await apiRequest<AnyRecord>(`/v1/game-sessions/${String(created.id)}/events`, {
        method: "POST",
        body: gameEventBatch(String(created.id), [
          { clientEventId: `live-start-${Date.now()}`, sequence: 1, eventType: "session_started", data: { nodeId } },
        ]),
      });
      setSession(afterStart);
      onNotice?.(`🎮 Game session ${String(created.id)} đã active trên /v1 (launchToken chỉ trả đúng lúc tạo).`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tạo được game session /v1.");
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    if (!session || busy || !open) return;
    setBusy(true);
    setError("");
    try {
      const stamp = Date.now();
      const updated = await apiRequest<AnyRecord>(`/v1/game-sessions/${String(session.id)}/events`, {
        method: "POST",
        body: gameEventBatch(String(session.id), [
          { clientEventId: `live-ans-${stamp}`, sequence: 2, eventType: "question_answered", data: { nodeId, correct: true } },
          { clientEventId: `live-cp-${stamp}`, sequence: 3, eventType: "checkpoint_reached", data: { checkpointId: nodeId } },
          { clientEventId: `live-done-${stamp}`, sequence: 4, eventType: "session_completed", data: { finalScore: 1 } },
        ]),
      });
      setSession(updated);
      onNotice?.("✅ Game session hoàn tất trên /v1 — validatedLearningEffect vẫn null trung thực (rubric thật ở VS sau).");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không gửi được event batch /v1.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel stack" aria-labelledby="game-session-heading" style={{ marginBottom: 18 }}>
      <h3 id="game-session-heading">🎮 Học tương tác qua Game session (/v1 thật)</h3>
      <p className="hint">
        Node đang học: <code>{nodeId}</code> · template <code>{templateId}</code> — POST /journeys/&#123;id&#125;/game-sessions
        rồi gửi event batch <code>gon.game-events/1.0</code> (idempotent theo clientEventId).
      </p>
      {session ? (
        <>
          <div className="badge-row">
            <span className={`badge ${String(session.status) === "completed" ? "success" : "info"}`}>
              {String(session.status)}
            </span>
            <span className="badge info">session {String(session.id)}</span>
            <span className="badge warning">validatedLearningEffect: {String(session.validatedLearningEffect)}</span>
          </div>
          {open ? (
            <button className="button primary" type="button" onClick={() => void complete()} disabled={busy}>
              {busy ? "Đang gửi…" : "✅ Hoàn thành phiên (session_completed)"}
            </button>
          ) : (
            <p className="hint">Phiên đã đóng — máy chủ từ chối event mới (409 GAME_SESSION_NOT_OPEN). Tạo phiên mới nếu muốn học lại.</p>
          )}
        </>
      ) : (
        <button className="button primary" type="button" onClick={() => void start()} disabled={busy}>
          {busy ? "Đang tạo…" : "🎮 Bắt đầu phiên học tương tác"}
        </button>
      )}
      {error ? <p className="notice" role="alert">{error}</p> : null}
    </section>
  );
}
