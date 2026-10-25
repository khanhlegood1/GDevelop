"use client";

import { useEffect, useMemo, useState } from "react";
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

/**
 * ⚔️ Arena — port production của FE-Confirm-9/11/13/14:
 * Battle ẩn danh 4 vote ±Elo · ⚖️ Side-by-side (user tự chọn 2 output) ·
 * 📺 embed FastChat-style cùng origin (/arena-embed.html?embed=1) + công thức
 * production self-host FastChat (Gradio/HF Space ?embed=true).
 *
 * VS1: votes là bề mặt CỤC BỘ (chưa ghi /v1 — backend arena xếp sau P05);
 * hợp đồng vote đã định kiểu trong src/lib/arena-surface.ts.
 */
export function ArenaPanel() {
  const [pairIndex, setPairIndex] = useState(0);
  const [battleVotes, setBattleVotes] = useState<Partial<Record<number, ArenaVoteRecord>>>({});
  const [sbA, setSbA] = useState(0);
  const [sbB, setSbB] = useState(1);
  const [sbStaged, setSbStaged] = useState(false);
  const [sbVote, setSbVote] = useState<"a" | "b" | null>(null);
  const [embedVotes, setEmbedVotes] = useState<ArenaVoteRecord[]>([]);
  const [notice, setNotice] = useState("");

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
          Bộ mode đầy đủ: Battle (ẩn danh) · ⚖️ Side-by-side (tự chọn) · 🤖 Agent (Journey Agent).
          VS1: vote là bề mặt cục bộ, chưa ghi vào /v1 — backend arena xếp sau P05.
        </p>
      </div>

      {notice ? <p className="notice" role="status">{notice}</p> : null}

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
