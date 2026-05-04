/* Chat surface — Aperture chat at /agents/<id>.
   Demonstrates message turns, streaming, tool-use, citations, composer,
   agent header strip, empty state, and error states. All inside the
   workspace chrome (rail + top bar + body padding) for context.

   Tokens align to Aperture handoff. Net-new tokens called out in the
   accompanying README under "Tokens · net-new". */

const chatCss = `
.cx, .cx * { box-sizing: border-box; font-style: normal; }
.cx p, .cx h1, .cx h2, .cx h3, .cx h4, .cx ul, .cx ol, .cx pre { margin: 0; padding: 0; }
.cx ul, .cx ol { list-style: none; }
.cx button { font: inherit; background: none; border: 0; padding: 0; cursor: pointer; color: inherit; }

.cx {
  display: grid;
  grid-template-columns: 232px 1fr;
  width: 100%; height: 900px;
  background: #f4f1ec;
  font-family: var(--display);
  color: #1a1816;
  border: 1px solid #d8d2c7;
}

/* — left rail (recap of workspace chrome) — */
.cx .rail {
  background: #efeae1; border-right: 1px solid #ebe6dc;
  padding: 22px 14px; display: flex; flex-direction: column; gap: 18px;
  font-size: 13px;
}
.cx .rail .brand { font-family: var(--display); font-size: 17px; font-weight: 500; letter-spacing: -0.015em; padding: 0 8px 12px; border-bottom: 1px solid #ebe6dc; }
.cx .rail .grp { display: flex; flex-direction: column; gap: 2px; }
.cx .rail .lbl { font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8174; padding: 0 8px 6px; }
.cx .rail a { display: flex; align-items: center; justify-content: space-between; padding: 7px 8px; border-radius: 6px; color: #4a4640; }
.cx .rail a.on { background: #1a1816; color: #f4f1ec; }
.cx .rail a .ct { font-family: var(--mono); font-size: 11px; color: #8a8174; }
.cx .rail a.on .ct { color: #c8c0b1; }

/* — main column — */
.cx .main { display: flex; flex-direction: column; min-width: 0; }
.cx .top {
  height: 48px; padding: 0 22px;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid #ebe6dc;
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em; color: #6b6358;
}
.cx .top b { font-family: var(--display); font-weight: 500; color: #1a1816; letter-spacing: -0.01em; }
.cx .top .live { color: #3b5680; display: inline-flex; align-items: center; gap: 6px; }
.cx .top .live::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #3b5680; }

/* — body wrapper — */
.cx .body { flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 56px 56px 32px; }

/* — agent header — */
.cx .ahead {
  display: grid; grid-template-columns: 1fr auto; gap: 18px;
  padding-bottom: 16px; border-bottom: 1px solid #ebe6dc;
  margin: 0 auto 24px; width: 100%; max-width: 768px;
}
.cx .ahead .nm { font-family: var(--display); font-size: 28px; font-weight: 400; letter-spacing: -0.025em; line-height: 1.05; color: #1a1816; }
.cx .ahead .desc { font-size: 13px; color: #6b6358; line-height: 1.55; margin-top: 6px; max-width: 60ch; }
.cx .ahead .meta { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
.cx .ahead .chip {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase;
  padding: 4px 9px; border-radius: 999px;
  background: #fbf9f4; border: 1px solid #ebe6dc; color: #6b6358;
}
.cx .ahead .chip.on { color: #3b5680; border-color: rgba(59,86,128,0.22); background: rgba(59,86,128,0.05); }
.cx .ahead .chip .dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.cx .ahead .actions { display: flex; flex-direction: column; align-items: end; gap: 8px; }
.cx .ahead .actions .edit {
  font-size: 12px; color: #6b6358; padding: 5px 10px; border-radius: 6px;
  border: 1px solid #ebe6dc; background: #fbf9f4;
}
.cx .ahead.deleted { padding: 16px 18px; border: 1px solid #d8d2c7; border-radius: 10px; background: #f0ebdf; }
.cx .ahead.deleted .nm { color: #6b6358; }
.cx .ahead.deleted .banner { font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #8a3a3a; margin-top: 8px; }

/* — message list — */
.cx .list {
  flex: 1; overflow-y: auto; min-height: 0;
  padding: 8px 0 24px;
}
.cx .col { width: 100%; max-width: 768px; margin: 0 auto; display: flex; flex-direction: column; gap: 28px; }

/* — speaker label + turn shape — */
.cx .turn { display: grid; grid-template-columns: 64px 1fr; gap: 18px; align-items: start; }
.cx .turn .who {
  font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase;
  color: #8a8174; padding-top: 2px;
}
.cx .turn .who.you { color: #3b5680; }
.cx .turn.you .body { color: #1a1816; }

/* — user turn body: right-aligned, lightly tinted — */
.cx .uturn .ubody {
  background: #efeae1; border: 1px solid #ebe6dc; border-radius: 10px;
  padding: 12px 16px;
  font-size: 14.5px; line-height: 1.55; color: #1a1816;
  white-space: pre-wrap;
}

/* — assistant prose — */
.cx .prose {
  font-size: 14.5px; line-height: 1.65; color: #1a1816;
  font-family: var(--display);
}
.cx .prose > * + * { margin-top: 12px; }
.cx .prose h2 { font-size: 18px; font-weight: 500; letter-spacing: -0.018em; margin-top: 18px; }
.cx .prose h3 { font-size: 15px; font-weight: 500; letter-spacing: -0.012em; margin-top: 16px; }
.cx .prose b, .cx .prose strong { font-weight: 600; }
.cx .prose ul, .cx .prose ol { display: flex; flex-direction: column; gap: 6px; padding-left: 0; }
.cx .prose li { padding-left: 18px; position: relative; }
.cx .prose ul li::before { content: ""; position: absolute; left: 4px; top: 0.7em; width: 5px; height: 5px; border-radius: 50%; background: #c8c0b1; }
.cx .prose ol { counter-reset: ol; }
.cx .prose ol li { counter-increment: ol; }
.cx .prose ol li::before { content: counter(ol) "."; position: absolute; left: 0; font-family: var(--mono); font-size: 12px; color: #8a8174; }
.cx .prose a { color: #3b5680; text-decoration: underline; text-decoration-color: rgba(59,86,128,0.35); text-underline-offset: 2px; }
.cx .prose code:not(pre code) {
  font-family: var(--mono); font-size: 12.5px;
  background: #f0ebdf; border: 1px solid #ebe6dc; border-radius: 4px;
  padding: 1px 5px; color: #2f4670;
}
.cx .prose pre {
  background: #1a1816; color: #ece8de;
  border-radius: 10px; padding: 14px 16px;
  font-family: var(--mono); font-size: 12.5px; line-height: 1.55;
  overflow-x: auto;
}
.cx .prose pre .kw { color: #b8c6dd; }
.cx .prose pre .str { color: #d4c49c; }
.cx .prose pre .com { color: #8a8174; }
.cx .prose blockquote { border-left: 2px solid #c8c0b1; padding-left: 14px; color: #6b6358; }
.cx .prose table { border-collapse: collapse; font-size: 13.5px; }
.cx .prose th, .cx .prose td { padding: 8px 12px; border: 1px solid #ebe6dc; text-align: left; }
.cx .prose th { background: #fbf9f4; font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b6358; font-weight: 500; }

/* — citations: superscript markers + footnote list — */
.cx .cite {
  display: inline-block; font-family: var(--mono); font-size: 9.5px;
  font-weight: 500; color: #3b5680;
  background: rgba(59,86,128,0.08);
  border: 1px solid rgba(59,86,128,0.18);
  padding: 1px 5px; border-radius: 4px;
  vertical-align: super; line-height: 1; margin-left: 2px;
  cursor: pointer; transition: background 180ms ease;
  text-decoration: none;
}
.cx .cite:hover { background: rgba(59,86,128,0.18); }
.cx .sources {
  margin-top: 18px; padding-top: 14px;
  border-top: 1px solid #ebe6dc;
}
.cx .sources .hd {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em;
  text-transform: uppercase; color: #8a8174; margin-bottom: 10px;
}
.cx .sources ol { display: flex; flex-direction: column; gap: 6px; padding: 0; }
.cx .sources li {
  display: grid; grid-template-columns: 22px 1fr auto; gap: 10px;
  font-size: 13px; padding: 0; align-items: baseline;
}
.cx .sources li::before { content: none; }
.cx .sources .n {
  font-family: var(--mono); font-size: 10.5px; color: #3b5680;
  font-weight: 500;
}
.cx .sources .ti { color: #1a1816; line-height: 1.4; }
.cx .sources .ti a { color: inherit; text-decoration: none; }
.cx .sources .ti a:hover { color: #3b5680; }
.cx .sources .dom {
  font-family: var(--mono); font-size: 10.5px; color: #8a8174;
  letter-spacing: 0.04em; white-space: nowrap;
}
.cx .sources.fold > ol > li:nth-child(n+6) { display: none; }
.cx .sources .more {
  margin-top: 8px; font-family: var(--mono); font-size: 10.5px;
  letter-spacing: 0.08em; color: #6b6358;
  display: inline-flex; align-items: center; gap: 6px;
}
.cx .sources .more:hover { color: #3b5680; }

/* — tool-use trace — */
.cx .tool {
  border: 1px solid #ebe6dc; border-radius: 10px;
  background: #fbf9f4;
  font-family: var(--mono); font-size: 12.5px; color: #4a4640;
  overflow: hidden;
}
.cx .tool .hd {
  display: grid; grid-template-columns: 18px 1fr auto auto;
  gap: 12px; align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 180ms ease;
}
.cx .tool .hd:hover { background: #f4f1ec; }
.cx .tool .hd .ic {
  width: 14px; height: 14px;
  border: 1.5px solid #6b6358; border-top-color: transparent; border-radius: 50%;
  animation: cx-spin 1s linear infinite;
}
.cx .tool.done .hd .ic {
  border: 1.5px solid #3b5680; border-radius: 50%;
  animation: none; position: relative;
}
.cx .tool.done .hd .ic::after {
  content: ""; position: absolute; left: 2px; top: 5px;
  width: 7px; height: 3px; border-left: 1.5px solid #3b5680; border-bottom: 1.5px solid #3b5680;
  transform: rotate(-45deg);
}
.cx .tool.err .hd .ic { border: 1.5px solid #8a3a3a; animation: none; }
@keyframes cx-spin { to { transform: rotate(360deg); } }
.cx .tool .lbl { color: #1a1816; font-family: var(--display); font-size: 13px; font-weight: 450; }
.cx .tool .arg { color: #6b6358; font-family: var(--mono); font-size: 12px; }
.cx .tool .ms { color: #8a8174; font-size: 11px; }
.cx .tool .chev { color: #8a8174; transition: transform 180ms ease; font-size: 10px; font-family: var(--mono); }
.cx .tool.open .chev { transform: rotate(90deg); }
.cx .tool .det {
  display: none; padding: 12px 14px 14px 44px;
  border-top: 1px solid #ebe6dc; background: #f4f1ec;
  font-size: 11.5px; color: #6b6358; line-height: 1.55;
}
.cx .tool.open .det { display: block; }
.cx .tool .det b { color: #1a1816; font-family: var(--display); font-size: 12px; font-weight: 500; }

/* — typing indicator (waiting for first token) — */
.cx .typing { display: inline-flex; gap: 5px; padding: 6px 0; }
.cx .typing span {
  width: 6px; height: 6px; border-radius: 50%;
  background: #c8c0b1;
  animation: cx-pulse 1.4s ease-in-out infinite;
}
.cx .typing span:nth-child(2) { animation-delay: 180ms; }
.cx .typing span:nth-child(3) { animation-delay: 360ms; }
@keyframes cx-pulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  40% { opacity: 1; transform: scale(1.15); }
}

/* — streaming caret — */
.cx .caret {
  display: inline-block; width: 7px; height: 1.05em;
  background: #1a1816; vertical-align: text-bottom;
  margin-left: 2px;
  animation: cx-blink 1s steps(2) infinite;
}
@keyframes cx-blink { 50% { opacity: 0; } }

/* — error banner — */
.cx .err {
  border: 1px solid rgba(138,58,58,0.3);
  background: #f9f0ec;
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 13px; color: #6e2e2e;
  display: grid; grid-template-columns: 16px 1fr auto; gap: 12px; align-items: center;
}
.cx .err .ic {
  width: 14px; height: 14px; border-radius: 50%;
  border: 1.5px solid #8a3a3a;
  display: grid; place-items: center;
  font-family: var(--mono); font-size: 10px; font-weight: 600;
  color: #8a3a3a;
}
.cx .err b { font-family: var(--display); font-weight: 500; color: #4a1f1f; }
.cx .err button.retry {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em;
  color: #6e2e2e; padding: 4px 10px; border-radius: 6px;
  border: 1px solid rgba(138,58,58,0.3);
}

/* — composer — */
.cx .compose {
  width: 100%; max-width: 768px; margin: 12px auto 0;
  background: #fff; border: 1px solid #d8d2c7; border-radius: 14px;
  box-shadow: 0 1px 2px rgba(26,24,22,0.04), 0 12px 28px -14px rgba(26,24,22,0.10);
  display: flex; flex-direction: column;
  transition: border-color 200ms ease, box-shadow 200ms ease;
}
.cx .compose:focus-within {
  border-color: rgba(59,86,128,0.45);
  box-shadow: 0 1px 2px rgba(26,24,22,0.05), 0 14px 30px -14px rgba(26,24,22,0.14), 0 0 0 3px rgba(59,86,128,0.08);
}
.cx .compose textarea {
  flex: 1; resize: none;
  padding: 16px 18px 4px;
  font-family: var(--display); font-size: 14.5px; line-height: 1.55;
  color: #1a1816; background: transparent;
  border: 0; outline: none; min-height: 56px; max-height: 220px;
}
.cx .compose textarea::placeholder { color: #8a8174; }
.cx .compose .row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 8px 12px 10px;
}
.cx .compose .lefttools { display: flex; align-items: center; gap: 6px; }
.cx .compose .tool-btn {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.05em; color: #6b6358;
  padding: 5px 9px; border-radius: 7px;
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid transparent;
  transition: background 180ms ease, color 180ms ease, border-color 180ms ease;
}
.cx .compose .tool-btn:hover { background: #f4f1ec; }
.cx .compose .tool-btn.on {
  color: #3b5680; background: rgba(59,86,128,0.06);
  border-color: rgba(59,86,128,0.2);
}
.cx .compose .tool-btn .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.cx .compose .attach-chip {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.05em;
  color: #4a4640; padding: 4px 8px;
  background: #f4f1ec; border: 1px solid #ebe6dc; border-radius: 6px;
}
.cx .compose .attach-chip .name { font-family: var(--display); font-size: 12px; letter-spacing: -0.005em; color: #1a1816; }
.cx .compose .attach-chip .sz { color: #8a8174; }
.cx .compose .righttools { display: flex; align-items: center; gap: 8px; }
.cx .compose .model {
  font-family: var(--mono); font-size: 11px; color: #6b6358;
  padding: 5px 9px; border-radius: 7px;
  border: 1px solid #ebe6dc; background: #fbf9f4;
  display: inline-flex; align-items: center; gap: 6px;
}
.cx .compose .send {
  width: 36px; height: 36px; border-radius: 9px;
  background: #1a1816; color: #f4f1ec;
  display: grid; place-items: center;
  transition: background 200ms ease, transform 200ms ease;
}
.cx .compose .send:disabled { background: #d8d2c7; color: #8a8174; cursor: not-allowed; }
.cx .compose .send.streaming {
  background: #fbf9f4; color: #1a1816; border: 1px solid #ebe6dc;
}
.cx .compose .hint {
  font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.06em; color: #8a8174;
  text-align: center; padding: 0 0 10px;
}
.cx .compose .hint kbd {
  font-family: var(--mono); font-size: 10px;
  padding: 1px 5px; border-radius: 4px;
  background: #f4f1ec; border: 1px solid #ebe6dc; color: #1a1816;
}
.cx .compose.disabled { background: #f4f1ec; opacity: 0.7; }
.cx .compose.disabled textarea { color: #8a8174; }

/* — empty state — */
.cx .empty {
  flex: 1; display: flex; flex-direction: column; justify-content: center;
  width: 100%; max-width: 768px; margin: 0 auto; padding: 0;
}
.cx .empty .lead {
  font-family: var(--display); font-size: 32px; font-weight: 400;
  letter-spacing: -0.028em; line-height: 1.1; color: #1a1816;
}
.cx .empty .lead b { color: #3b5680; font-weight: 500; }
.cx .empty .desc {
  font-size: 14.5px; color: #6b6358; line-height: 1.6;
  margin-top: 14px; max-width: 56ch;
}
.cx .empty .facts {
  margin-top: 28px; padding-top: 18px; border-top: 1px solid #ebe6dc;
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px;
}
.cx .empty .fact .k {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em;
  text-transform: uppercase; color: #8a8174;
}
.cx .empty .fact .v {
  font-family: var(--display); font-size: 15px; font-weight: 500;
  letter-spacing: -0.012em; color: #1a1816; margin-top: 4px;
}
.cx .empty .files {
  margin-top: 20px; display: flex; flex-direction: column; gap: 6px;
}
.cx .empty .files .f {
  display: grid; grid-template-columns: 1fr auto; gap: 12px;
  font-size: 13px; color: #4a4640;
  padding: 10px 12px; background: #fbf9f4; border: 1px solid #ebe6dc;
  border-radius: 8px;
}
.cx .empty .files .f .nm { font-family: var(--display); font-weight: 450; color: #1a1816; }
.cx .empty .files .f .sz { font-family: var(--mono); font-size: 11px; color: #8a8174; }

/* — turn nav — */
.cx .turnnav {
  position: sticky; top: 12px; align-self: flex-end;
  margin-right: -160px; width: 132px;
  font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.06em;
  display: flex; flex-direction: column; gap: 2px;
  pointer-events: auto;
}
.cx .turnnav .hd { color: #8a8174; padding: 0 8px 4px; letter-spacing: 0.16em; text-transform: uppercase; font-size: 10px; }
.cx .turnnav a {
  display: flex; gap: 8px; padding: 5px 8px; border-radius: 6px;
  color: #6b6358; transition: background 160ms ease, color 160ms ease;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cx .turnnav a:hover { background: #efeae1; color: #1a1816; }
.cx .turnnav a.cur { color: #3b5680; }
.cx .turnnav a .n { color: #c8c0b1; font-variant-numeric: tabular-nums; }
.cx .turnnav a.cur .n { color: #3b5680; }

.cx .stop {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em;
  padding: 5px 11px; border-radius: 7px;
  background: #fff; border: 1px solid #d8d2c7; color: #1a1816;
}
.cx .stop .sq { width: 8px; height: 8px; background: #1a1816; border-radius: 1px; }
`;

/* ──────────────────────────────────────────────────────────────────
   Reusable building blocks
   ──────────────────────────────────────────────────────────────── */

function Rail() {
  return (
    <aside className="rail">
      <div className="brand">legalOS</div>
      <div className="grp">
        <a><span>Workspace</span><span className="ct">⌘1</span></a>
      </div>
      <div className="grp">
        <div className="lbl">Departments</div>
        <a><span>Commercial</span><span className="ct">12</span></a>
        <a className="on"><span>Privacy</span><span className="ct">6</span></a>
        <a><span>M & A</span><span className="ct">4</span></a>
        <a><span>Compliance</span><span className="ct">4</span></a>
      </div>
      <div className="grp">
        <a><span>Knowledge</span><span className="ct"></span></a>
        <a><span>Matters / Deals</span><span className="ct">23</span></a>
        <a><span>Inbox</span><span className="ct">14</span></a>
        <a><span>Resources</span><span className="ct"></span></a>
      </div>
    </aside>
  );
}

function TopBar({ crumb }) {
  return (
    <header className="top">
      <span>{crumb || <>privacy / agents / <b>DPA Reviewer</b></>}</span>
      <span className="live">streaming · gpt-5</span>
    </header>
  );
}

function AgentHeader({ deleted }) {
  if (deleted) {
    return (
      <div className="ahead deleted">
        <div>
          <div className="nm">DPA Reviewer</div>
          <div className="desc">Reviews data-processing agreements against the company DPA template and Schedule 2 control list.</div>
          <div className="banner">⏷ archived · transcript retained for record · no new turns accepted</div>
        </div>
      </div>
    );
  }
  return (
    <div className="ahead">
      <div>
        <div className="nm">DPA Reviewer</div>
        <div className="desc">Reviews vendor DPAs against the company template. Flags Schedule 2 deviations, sub-processor approval gaps, and cross-border transfer terms.</div>
        <div className="meta">
          <span className="chip">claude-sonnet-4-5</span>
          <span className="chip on"><span className="dot"/>web search</span>
          <span className="chip">3 attached</span>
        </div>
      </div>
      <div className="actions">
        <button className="edit">Edit agent →</button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Turns
   ──────────────────────────────────────────────────────────────── */
function UserTurn({ children }) {
  return (
    <div className="turn uturn">
      <div className="who you">You</div>
      <div className="ubody">{children}</div>
    </div>
  );
}

function AssistantTurn({ children }) {
  return (
    <div className="turn aturn">
      <div className="who">Agent</div>
      <div className="prose">{children}</div>
    </div>
  );
}

function Cite({ n }) { return <a href="#" className="cite">{n}</a>; }

function Sources({ items, fold }) {
  return (
    <div className={`sources ${fold ? "fold" : ""}`}>
      <div className="hd">Sources</div>
      <ol>
        {items.map((s, i) => (
          <li key={i}>
            <span className="n">{i + 1}</span>
            <span className="ti"><a href={s.url}>{s.title}</a></span>
            <span className="dom">{s.dom}</span>
          </li>
        ))}
      </ol>
      {fold && items.length > 5 && <button className="more">show {items.length - 5} more →</button>}
    </div>
  );
}

function ToolTrace({ status = "running", label, arg, ms, detail, open: initialOpen }) {
  const [open, setOpen] = React.useState(!!initialOpen);
  return (
    <div className={`tool ${status} ${open ? "open" : ""}`}>
      <div className="hd" onClick={() => setOpen(o => !o)}>
        <span className="ic"/>
        <span><span className="lbl">{label}</span> <span className="arg">{arg}</span></span>
        <span className="ms">{ms}</span>
        <span className="chev">›</span>
      </div>
      <div className="det">{detail}</div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Scenes (each artboard renders one)
   ──────────────────────────────────────────────────────────────── */

function Shell({ children, crumb, hideHeader }) {
  return (
    <div className="ab cx" data-screen-label="Chat surface">
      <style>{chatCss}</style>
      <Rail/>
      <main className="main">
        <TopBar crumb={crumb}/>
        <div className="body">{children}</div>
      </main>
    </div>
  );
}

function SceneActive() {
  return (
    <Shell>
      <AgentHeader/>
      <div className="list">
        <div className="col">
          <UserTurn>
{`Review the attached vendor DPA against our template. Flag any Schedule 2 deviations and any cross-border transfer terms that don't reference EU SCCs 2021/914.`}
          </UserTurn>

          <AssistantTurn>
            <ToolTrace status="done" label="Reading" arg="acme-vendor-dpa-2026.pdf" ms="1.2s" detail={<><b>Result.</b> 22 pages parsed. Schedule 2 detected on pp. 14–18. Cross-border clauses on pp. 8, 11.</>}/>
            <p>I reviewed the Acme vendor DPA (22 pages) against your company template. Three findings worth your attention.</p>

            <h3>1 · Schedule 2 deviations</h3>
            <p>Acme's control list omits two technical measures we require<Cite n="1"/>:</p>
            <ul>
              <li><b>Encryption at rest with customer-held keys.</b> Their Schedule 2 §2.1 references "industry-standard encryption" without a key-custody clause.</li>
              <li><b>Pseudonymisation for non-production environments.</b> Not present.</li>
            </ul>
            <p>Both are required by our template §6.2(a)–(b). Recommend redlining their Schedule 2 to insert our wording verbatim.</p>

            <h3>2 · Sub-processor approval</h3>
            <p>Acme's clause 7.3 grants <i>general written authorisation</i> with a 14-day objection window<Cite n="2"/>. Our template requires <i>specific prior written consent</i> per sub-processor. The shorter notice window is also out of step with current EDPB guidance, which contemplates 30 days minimum<Cite n="3"/>.</p>

            <h3>3 · Cross-border transfers</h3>
            <p>Section 11 cites the 2010 SCCs. Those were superseded by Decision 2021/914 in September 2021<Cite n="4"/><Cite n="5"/>. Acme must update.</p>

            <pre>{`§11.2  Where Personal Data is transferred outside the EEA,
        the parties shall enter into the Standard Contractual
        Clauses adopted by the European Commission Decision
-       2010/87/EU
+       (EU) 2021/914 of 4 June 2021, Modules 1 and 2 as applicable.`}</pre>

            <Sources items={[
              { n: 1, title: "Acme — Schedule 2 (Technical & Organisational Measures)", url: "#", dom: "acme-vendor-dpa-2026.pdf · p.14" },
              { n: 2, title: "Acme — Clause 7 Sub-processors", url: "#", dom: "acme-vendor-dpa-2026.pdf · p.6" },
              { n: 3, title: "EDPB Guidelines 07/2020 on the concepts of controller and processor", url: "#", dom: "edpb.europa.eu" },
              { n: 4, title: "Commission Implementing Decision (EU) 2021/914", url: "#", dom: "eur-lex.europa.eu" },
              { n: 5, title: "Commission Decision 2010/87/EU (repealed)", url: "#", dom: "eur-lex.europa.eu" },
            ]}/>
          </AssistantTurn>

          <UserTurn>
            Draft a redline letter to their counsel covering finding 1 and 3. Tone: collaborative, not adversarial.
          </UserTurn>

          <AssistantTurn>
            <ToolTrace status="running" label="Searching the web for" arg="EDPB sub-processor 30 day notice 2025" ms="0.8s"/>
            <p>Drafting<span className="caret"/></p>
          </AssistantTurn>
        </div>
      </div>

      <div className="compose">
        <textarea placeholder="Reply to DPA Reviewer…" defaultValue=""/>
        <div className="row">
          <div className="lefttools">
            <span className="attach-chip"><span className="name">acme-dpa.pdf</span><span className="sz">214 kb</span></span>
            <span className="attach-chip"><span className="name">company-template.docx</span><span className="sz">88 kb</span></span>
            <span className="attach-chip"><span className="name">+1</span></span>
            <button className="tool-btn on"><span className="dot"/>web search</button>
          </div>
          <div className="righttools">
            <button className="model">claude-sonnet-4-5 ▾</button>
            <button className="stop"><span className="sq"/>stop</button>
          </div>
        </div>
        <div className="hint"><kbd>⌘</kbd> + <kbd>Return</kbd> to send · <kbd>Return</kbd> for newline · drafts saved locally</div>
      </div>
    </Shell>
  );
}

function SceneEmpty() {
  return (
    <Shell crumb={<>privacy / agents / <b>DPA Reviewer</b></>}>
      <AgentHeader/>
      <div className="empty">
        <div>
          <div className="lead">Start with <b>DPA Reviewer</b>.</div>
          <p className="desc">Reviews vendor DPAs against the company template. Flags Schedule 2 deviations, sub-processor approval gaps, and cross-border transfer terms. Long sessions are expected — drafts save automatically to this agent.</p>
          <div className="facts">
            <div className="fact"><div className="k">Model</div><div className="v">claude-sonnet-4-5</div></div>
            <div className="fact"><div className="k">Web search</div><div className="v">on</div></div>
            <div className="fact"><div className="k">Last updated</div><div className="v">Apr 24 · by R. Iyer</div></div>
          </div>
          <div className="files">
            <div className="f"><span className="nm">company-dpa-template-v3.docx</span><span className="sz">88 kb</span></div>
            <div className="f"><span className="nm">schedule-2-control-list.xlsx</span><span className="sz">42 kb</span></div>
            <div className="f"><span className="nm">edpb-guidance-bookmarks.md</span><span className="sz">6 kb</span></div>
          </div>
        </div>
      </div>
      <div className="compose">
        <textarea placeholder="Type a question or paste a DPA to review. ⌘+Return to send."/>
        <div className="row">
          <div className="lefttools">
            <button className="tool-btn on"><span className="dot"/>web search</button>
          </div>
          <div className="righttools">
            <button className="model">claude-sonnet-4-5 ▾</button>
            <button className="send" disabled>↑</button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function SceneError() {
  return (
    <Shell>
      <AgentHeader/>
      <div className="list">
        <div className="col">
          <UserTurn>Compare clause 11.2 of the attached DPA to our template language.</UserTurn>
          <AssistantTurn>
            <ToolTrace status="err" label="Web search failed" arg="EDPB sub-processor 30 day notice" ms="3.0s" detail={<><b>Error.</b> Connector returned 503 after 3 retries. The model continued without web context for this turn.</>}/>
            <p>Acme's clause 11.2 references the 2010 SCCs (Decision 2010/87/EU). Our template requires the 2021 SCCs (Decision 2021/914). The wording change is small but legally material.</p>
            <div className="err">
              <div className="ic">!</div>
              <div><b>Stream interrupted.</b> Connection to the model was lost mid-response. The text above is what arrived. You can retry the turn or continue from here.</div>
              <button className="retry">retry</button>
            </div>
          </AssistantTurn>
        </div>
      </div>
      <div className="compose">
        <textarea placeholder="Reply to DPA Reviewer…"/>
        <div className="row">
          <div className="lefttools">
            <button className="tool-btn on"><span className="dot"/>web search</button>
          </div>
          <div className="righttools">
            <button className="model">claude-sonnet-4-5 ▾</button>
            <button className="send">↑</button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function SceneDeleted() {
  return (
    <Shell crumb={<>privacy / agents / <b>DPA Reviewer (archived)</b></>}>
      <AgentHeader deleted/>
      <div className="list">
        <div className="col">
          <UserTurn>Old transcript preserved. No new turns accepted.</UserTurn>
          <AssistantTurn>
            <p>Reviewed. See findings above. (This is the last turn before the agent was archived on April 24 by R. Iyer.)</p>
          </AssistantTurn>
        </div>
      </div>
      <div className="compose disabled">
        <textarea placeholder="This agent is archived. Transcript is read-only." disabled/>
        <div className="row">
          <div className="lefttools"></div>
          <div className="righttools">
            <button className="send" disabled>↑</button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

window.SceneActive = SceneActive;
window.SceneEmpty = SceneEmpty;
window.SceneError = SceneError;
window.SceneDeleted = SceneDeleted;
window.chatCss = chatCss;
