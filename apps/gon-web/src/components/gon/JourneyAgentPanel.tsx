"use client";

import { useEffect, useRef, useState } from "react";
import {
  AGENT_SIGNALS,
  JOURNEY_AGENT_STEPS,
  pickBlindOrchestrator,
  type OrchestratorProfile,
} from "@/lib/journey-agent-surface";

export interface JourneyAgentPanelProps {
  /** tín hiệu live từ dữ liệu thật của app (mặc định 0 — VS1 chưa gắn đủ) */
  signals?: Partial<Record<"confirmedSuccess" | "praise" | "complaint" | "steerability" | "recovery", number>>;
  /** gọi lại khi người học phản hồi phiên agent (confirmed success / complaint) */
  onFeedback?: (ok: boolean, orchestrator: string) => void;
}

type RunPhase = "idle" | "running" | "done";

/**
 * 🤖 Journey Agent — port production của FE-Confirm-12 (Agent Mode arena.ai).
 * 1 lệnh → 7 bước tool-call; orchestrator ngẫu nhiên kín tên, chỉ mở sau khi xong.
 * VS1: trace mô phỏng cục bộ (production chạy Google ADK + Gemini thật — P05+).
 */
export function JourneyAgentPanel({ signals, onFeedback }: JourneyAgentPanelProps) {
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [step, setStep] = useState(0);
  const [orchestrator, setOrchestrator] = useState<OrchestratorProfile | null>(null);
  const [feedback, setFeedback] = useState<"ok" | "bad" | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => { if (timerRef.current !== null) window.clearInterval(timerRef.current); }, []);

  function start() {
    if (phase === "running") return;
    setOrchestrator(pickBlindOrchestrator());
    setStep(0);
    setFeedback(null);
    setPhase("running");
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setStep((current) => {
        if (current + 1 >= JOURNEY_AGENT_STEPS.length) {
          if (timerRef.current !== null) window.clearInterval(timerRef.current);
          setPhase("done");
          return JOURNEY_AGENT_STEPS.length;
        }
        return current + 1;
      });
    }, 700);
  }

  function confirm(ok: boolean) {
    if (phase !== "done" || feedback !== null || !orchestrator) return;
    setFeedback(ok ? "ok" : "bad");
    onFeedback?.(ok, orchestrator.name);
  }

  const s = {
    confirmedSuccess: signals?.confirmedSuccess ?? 0,
    praise: signals?.praise ?? 0,
    complaint: signals?.complaint ?? 0,
    steerability: signals?.steerability ?? 0,
    recovery: signals?.recovery ?? 0,
  };

  return (
    <section className="panel stack" aria-labelledby="journey-agent-heading">
      <div>
        <p className="eyebrow">Agent Mode (arena.ai) → GON</p>
        <h2 id="journey-agent-heading">🤖 Journey Agent — 1 lệnh, trọn hành trình</h2>
        <p className="hint">
          Một đầu vào duy nhất → agent tự thực thi trọn lộ trình bằng tools. Orchestrator gán ngẫu nhiên
          kín tên mỗi phiên, chỉ mở sau khi xong (nguyên tắc mù của arena.ai). VS1: trace mô phỏng cục bộ —
          production chạy Google ADK + Gemini (kiến trúc WSIC).
        </p>
      </div>

      {phase === "idle" ? (
        <button className="button primary" type="button" onClick={start}>🚀 Chạy Journey Agent (1 lệnh)</button>
      ) : (
        <ol className="stack" aria-label="Trace hành trình agent">
          {JOURNEY_AGENT_STEPS.map((agentStep, index) => (
            <li key={agentStep.tool} data-status={index < step ? "done" : index === step && phase === "running" ? "active" : "pending"}>
              <strong>{agentStep.title}</strong> <span className="badge info">tool: {agentStep.tool}</span>
              <br />
              <small className="hint">{agentStep.detail}</small>
            </li>
          ))}
        </ol>
      )}

      {phase === "running" ? <p className="hint">🎭 orchestrator ẩn danh — mở sau khi hành trình xong…</p> : null}

      {phase === "done" && orchestrator ? (
        <div className="stack">
          <div className="badge-row">
            <span className="badge success">🏷️ Orchestrator: {orchestrator.name}</span>
            <span className="badge warning">🔧 tín hiệu recovery: query yếu → Brew</span>
          </div>
          {feedback === null ? (
            <div className="badge-row">
              <button className="button primary" type="button" onClick={() => confirm(true)}>✅ Hành trình xong tốt</button>
              <button className="button secondary" type="button" onClick={() => confirm(false)}>👎 Chưa đạt</button>
            </div>
          ) : (
            <p className="notice">{feedback === "ok" ? "✅ đã xác nhận (Confirmed success)" : "👎 đã ghi nhận phản hồi chưa đạt (Praise vs complaint)"}</p>
          )}
          <button className="button secondary" type="button" onClick={start}>🔁 Chạy lại (orchestrator ngẫu nhiên)</button>
        </div>
      ) : null}

      <div>
        <h3>5 tín hiệu Agent Arena → map sang GON</h3>
        <ul className="stack">
          {AGENT_SIGNALS.map((signal) => (
            <li key={signal.id}>
              <strong>{signal.label}</strong>{signal.weight !== 1 ? ` (×${signal.weight})` : ""} — {signal.gonMeaning}
            </li>
          ))}
        </ul>
        <p className="hint">
          Số liệu phiên này: ✅ {s.confirmedSuccess} · 🗣️ {s.praise} khen / {s.complaint} chê · 🎯 {s.steerability} · 🔧 {s.recovery} · 👻 0 vụ khai man.
        </p>
      </div>
    </section>
  );
}
