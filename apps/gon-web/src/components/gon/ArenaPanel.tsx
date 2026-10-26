"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import {
  ARENA_ELO_DELTAS,
  ARENA_PAIRS,
  applyArenaVote,
  canStageSideBySide,
  fastChatEmbedUrl,
  gonArenaEmbedUrl,
  SIDE_BY_SIDE_OUTPUTS,
  type ArenaVoteRecord,
} from "@/lib/arena-surface";
import { arenaLiveCandidateIds, arenaLiveSlotLabel, ARENA_VOTE_CHOICES } from "@/lib/gon-live-api";

export interface ArenaPanelProps {
  /** project đang chọn — có CandidateSet thì mở được trận /v1 thật (Apply-2). */
  projectId?: string | null;
  /** candidates từ Output Explorer — cần ≥2 id unique để tạo trận /v1. */
  candidates?: Array<{ id: string; title?: unknown; format?: unknown }>;
}

/**
 * ⚔️ Arena — port production của FE-Confirm-9/11/13/14:
 * Battle ẩn danh 4 vote ±Elo · ⚖️ Side-by-side (user tự chọn 2 output) ·
 * 📺 embed FastChat-style cùng origin (/arena-embed.html?embed=1) + công thức
 * production self-host FastChat (Gradio/HF Space ?embed=true).
 *
 * VS1: votes là bề mặt CỤC BỘ (chưa ghi /v1 — backend arena xếp sau P05);
 * hợp đồng vote đã định kiểu trong src/lib/arena-surface.ts.
 */
export function ArenaPanel({ projectId, candidates }: ArenaPanelProps) {
  const [pairIndex, setPairIndex] = useState(0);
  const [battleVotes, setBattleVotes] = useState<Partial<Record<number, ArenaVoteRecord>>>({});
  const [sbA, setSbA] = useState(0);
  const [sbB, setSbB] = useState(1);
  const [sbStaged, setSbStaged] = useState(false);
  const [sbVote, setSbVote] = useState<"a" | "b" | null>(null);
  const [embedVotes, setEmbedVotes] = useState<ArenaVoteRecord[]>([]);
  const [notice, setNotice] = useState("");

  // Apply-3b: trận đấu /v1 thật (backend Apply-2) khi có project + ≥2 output.
  const liveIds = arenaLiveCandidateIds(candidates ?? []);
  const [liveMatch, setLiveMatch] = useState<Record<string, unknown> | null>(null);
  const [liveResult, setLiveResult] = useState<Record<string, unknown> | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState("");

  async function startLiveMatch() {
    if (!projectId || !liveIds || liveBusy) return;
    setLiveBusy(true);
    setLiveError("");
    setLiveMatch(null);
    setLiveResult(null);
    try {
      const data = await apiRequest<Record<string, unknown>>(`/v1/projects/${projectId}/arena-matches`, {
        method: "POST",
        body: { candidateIds: liveIds },
      });
      setLiveMatch(data);
    } catch (cause) {
      setLiveError(cause instanceof Error ? cause.message : "Không tạo được trận đấu /v1 (cần CandidateSet — chạy Search/Brew trước).");
    } finally {
      setLiveBusy(false);
    }
  }

  async function voteLive(choice: string) {
    if (!liveMatch || liveResult || liveBusy) return;
    setLiveBusy(true);
    setLiveError("");
    try {
      const data = await apiRequest<Record<string, unknown>>(`/v1/arena-matches/${String(liveMatch.id)}/votes`, {
        method: "POST",
        body: { choice },
      });
      setLiveResult(data);
      const match = data.match as Record<string, unknown> | undefined;
      if (match) setLiveMatch(match);
    } catch (cause) {
      setLiveError(cause instanceof Error ? cause.message : "Không ghi được vote /v1.");
    } finally {
      setLiveBusy(false);
    }
  }

  const pair = ARENA_PAIRS[pairIndex]!;
  const battleVote = battleVotes[pairIndex] ?? null;

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as { app?: string; type?: string; choice?: ArenaVoteRecord["choice"]; model?: string | null };
      if (!data || data.app !== "gon-arena-embed" || data.type !== "vote") return;
      const record: ArenaVoteRecord = { choice: data.choice ?? "tie", model: data.model ?? null, via: "embed", t: Date.now() };
      setEmbedVotes((current) => [...current, record]);
      setNotice(`📺 Vote từ FastChat embed: ${record.choice}${record.model ? ` — ${record.model}` : ""}`);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function voteBattle(choice: ArenaVoteRecord["choice"]) {
    if (battleVote) return;
    setBattleVotes((current) => ({ ...current, [pairIndex]: applyArenaVote(choice, pair) }));
  }

  function stageSideBySide() {
    if (!canStageSideBySide(sbA, sbB, SIDE_BY_SIDE_OUTPUTS.length)) {
      setNotice("⚖️ Chọn 2 output khác nhau để so");
      return;
    }
    setNotice("");
    setSbStaged(true);
    setSbVote(null);
  }

  const stagedPair = useMemo(() => {
    if (!sbStaged) return null;
    return { a: SIDE_BY_SIDE_OUTPUTS[sbA]!, b: SIDE_BY_SIDE_OUTPUTS[sbB]! };
  }, [sbStaged, sbA, sbB]);

  const sbElo = sbVote ? ARENA_ELO_DELTAS[sbVote] : null;

  return (
    <section className="stack" aria-labelledby="arena-heading">
      <div className="section-heading">
        <p className="eyebrow">arena.ai pattern · FastChat (Gate 0)</p>
        <h2 id="arena-heading">⚔️ Arena</h2>
        <p className="hint">
          Bộ mode đầy đủ: Battle (ẩn danh) · ⚖️ Side-by-side (tự chọn) · 🤖 Agent (Journey Agent) ·
          🔌 Live /v1 (ghi vote thật vào backend từ Apply-2; Battle/Side-by-side vẫn là bề mặt cục bộ).
        </p>
      </div>

      {notice ? <p className="notice" role="status">{notice}</p> : null}

      <article className="panel stack" aria-labelledby="arena-live-heading">
        <h3 id="arena-live-heading">🔌 Trận đấu /v1 thật (Arena live)</h3>
        {projectId && liveIds ? (
          <>
            <p className="hint">
              POST /projects/&#123;id&#125;/arena-matches → POST /arena-matches/&#123;id&#125;/votes.
              Trước vote chỉ thấy nhãn ẩn danh; sau vote backend mở full output (revealedCandidates).
            </p>
            {!liveMatch ? (
              <button className="button primary" type="button" onClick={() => void startLiveMatch()} disabled={liveBusy}>
                {liveBusy ? "Đang tạo…" : "⚔️ Tạo trận đấu /v1"}
              </button>
            ) : (
              <>
                <div className="workspace-grid">
                  {(["slotA", "slotB"] as const).map((slot) => {
                    const label = arenaLiveSlotLabel(liveMatch[slot]);
                    return (
                      <div key={slot} className="panel stack">
                        <strong>{label.summary}</strong>
                        <p className="hint">{label.format} · {label.estimatedMinutes} phút</p>
                      </div>
                    );
                  })}
                </div>
                {liveResult ? (
                  <>
                    <p>
                      <span className="badge success">
                        Đã vote: {String((liveResult.vote as Record<string, unknown> | undefined)?.choice ?? "")} · match {String(liveMatch.status)}
                      </span>
                    </p>
                    <ul className="stack">
                      {(Array.isArray(liveMatch.revealedCandidates) ? liveMatch.revealedCandidates : []).map((candidate, index) => (
                        <li key={index}>🏷️ {String((candidate as Record<string, unknown>).title ?? "")}</li>
                      ))}
                    </ul>
                    <p className="hint">
                      Tín hiệu ranking: {(Array.isArray(liveResult.personalRankingExplanationCodes) ? liveResult.personalRankingExplanationCodes : []).join(", ")}
                      {" "}· merge: {String(liveResult.mergedCandidateId ?? "null")} (trung thực — merge thật ở VS sau)
                    </p>
                  </>
                ) : (
                  <div className="badge-row">
                    {ARENA_VOTE_CHOICES.map((choice) => (
                      <button
                        key={choice.id}
                        className="button secondary"
                        type="button"
                        onClick={() => void voteLive(choice.id)}
                        disabled={liveBusy}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {liveError ? <p className="notice" role="alert">{liveError}</p> : null}
          </>
        ) : (
          <p className="hint">
            Chưa đủ điều kiện ghi /v1 — cần chọn project và có ≥2 output (chạy Search/Brew ở trang Bắt đầu).
            Các khung Battle/Side-by-side dưới đây vẫn là bề mặt cục bộ.
          </p>
        )}
      </article>

      <article className="panel stack" aria-labelledby="battle-heading">
        <h3 id="battle-heading">🗡️ Battle — 2 output ẩn danh (cặp {pairIndex + 1}/{ARENA_PAIRS.length})</h3>
        <p className="hint">Chủ đề: {pair.topic} — nhãn model chỉ mở sau khi vote.</p>
        <div className="workspace-grid">
          {(["a", "b"] as const).map((side) => {
            const output = pair[side];
            const chosen = battleVote?.choice === side;
            const delta = battleVote ? ARENA_ELO_DELTAS[battleVote.choice][side] : null;
            return (
              <div key={side} className="panel stack">
                <strong>{output.title}</strong>
                {battleVote ? (
                  <>
                    <p><span className="badge info">🏷️ {output.model}{chosen ? " · lựa chọn của bạn" : ""}</span></p>
                    <p><span className={`badge ${delta! >= 0 ? "success" : "warning"}`}>📈 Elo {delta! >= 0 ? "+" : ""}{delta}</span></p>
                  </>
                ) : (
                  <button className="button primary" type="button" onClick={() => voteBattle(side)}>Chọn {side.toUpperCase()}</button>
                )}
              </div>
            );
          })}
        </div>
        {!battleVote ? (
          <div className="badge-row">
            <button className="button secondary" type="button" onClick={() => voteBattle("tie")}>🤝 Hoà</button>
            <button className="button secondary" type="button" onClick={() => voteBattle("bothbad")}>👎 Cả hai chưa đạt</button>
          </div>
        ) : null}
        <button className="button secondary" type="button" onClick={() => setPairIndex((current) => (current + 1) % ARENA_PAIRS.length)}>⚔️ Đấu cặp khác</button>
      </article>

      <article className="panel stack" aria-labelledby="side-by-side-heading">
        <h3 id="side-by-side-heading">⚖️ So trực tiếp (Side-by-side)</h3>
        <p className="hint">Bạn TỰ CHỌN 2 output (không ẩn danh như Battle) — vote vẫn là tín hiệu Arena.</p>
        <div className="badge-row">
          <label className="field">
            <span>Output A</span>
            <select value={sbA} onChange={(event) => { setSbA(Number(event.target.value)); setSbStaged(false); setSbVote(null); }}>
              {SIDE_BY_SIDE_OUTPUTS.map((output, index) => (
                <option key={output.id} value={index}>{output.title}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Output B</span>
            <select value={sbB} onChange={(event) => { setSbB(Number(event.target.value)); setSbStaged(false); setSbVote(null); }}>
              {SIDE_BY_SIDE_OUTPUTS.map((output, index) => (
                <option key={output.id} value={index}>{output.title}</option>
              ))}
            </select>
          </label>
          <button className="button primary" type="button" onClick={stageSideBySide}>⚖️ So sánh</button>
        </div>
        {stagedPair ? (
          <div className="workspace-grid">
            {(["a", "b"] as const).map((side) => {
              const output = stagedPair[side];
              const chosen = sbVote === side;
              const delta = sbElo ? sbElo[side] : null;
              return (
                <div key={side} className="panel stack">
                  <strong>{output.title}</strong>
                  {sbVote ? (
                    <>
                      <p><span className="badge info">🏷️ {output.model}{chosen ? " · lựa chọn của bạn" : ""}</span></p>
                      <p><span className={`badge ${delta! >= 0 ? "success" : "warning"}`}>📈 Elo {delta! >= 0 ? "+" : ""}{delta}</span></p>
                    </>
                  ) : (
                    <button className="button primary" type="button" onClick={() => setSbVote(side)}>Chọn {side.toUpperCase()}</button>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </article>

      <article className="panel stack" aria-labelledby="fastchat-heading">
        <h3 id="fastchat-heading">📺 Đấu trường FastChat (embed cùng origin)</h3>
        <iframe
          src={gonArenaEmbedUrl()}
          title="GON Arena — FastChat-style embed (cùng origin)"
          style={{ width: "100%", height: 480, border: "1px solid var(--line, #2a3550)", borderRadius: 12, background: "#0b1226" }}
        />
        <p className="hint">
          Stand-in offline cho FastChat self-host. Production: tự host FastChat (Gate 0, Apache-2.0) dưới
          Gradio/HF Space rồi nhúng <code>{fastChatEmbedUrl("fastchat-space")}</code> — KHÔNG nhúng
          arena.ai/lmarena trực tiếp (bị chặn iframe + phạm ToS). Vote trong khung gửi về qua postMessage.
        </p>
        {embedVotes.length > 0 ? (
          <ul className="stack">
            {embedVotes.map((vote, index) => (
              <li key={`${vote.t}-${index}`}>🗳 {vote.choice}{vote.model ? ` — ${vote.model}` : ""} · qua embed</li>
            ))}
          </ul>
        ) : (
          <p className="hint">Chưa có vote qua embed — vote ngay trong khung phía trên.</p>
        )}
      </article>
    </section>
  );
}
