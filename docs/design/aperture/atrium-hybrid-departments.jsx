/* Atrium Hybrid — Departments landing, three polished variants.
   Each variant: same hybrid skeleton (Atrium left nav + Stillness type, blue accent),
   landing surface = department cards.
   Subtle curves, dynamic cards, soft shadows, polished restraint.
   No italics. Inter Tight only. */

const hybridLandingCss = `
.hybl {
  width: 1440px; height: 900px;
  font-family: var(--ui);
  background: #f4f1ec;
  color: #1a1816;
  display: grid;
  grid-template-columns: 232px 1fr;
  border: 1px solid #e3ddd1;
  overflow: hidden;
  font-feature-settings: "ss01", "cv11";
  border-radius: 14px;
}

/* ── shared left nav (curved, calm) ─────────────────────────────── */
.hybl-nav {
  border-right: 1px solid #e8e2d4;
  background: #efeae1;
  padding: 22px 14px;
  display: flex; flex-direction: column;
  gap: 22px;
  overflow: auto;
}
.hybl-nav .brand {
  display: flex; align-items: center; gap: 10px;
  font-family: var(--display); font-size: 15px; font-weight: 600;
  letter-spacing: -0.015em;
  padding: 2px 8px 0;
}
.hybl-nav .brand::before {
  content: ""; width: 7px; height: 7px; border-radius: 50%;
  background: #3b5680;
}
.hybl-nav .group { display: flex; flex-direction: column; gap: 1px; }
.hybl-nav .lbl {
  font-family: var(--mono); font-size: 10px;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: #8a8174; margin: 0 8px 8px;
}
.hybl-nav a {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 13.5px; font-weight: 450;
  color: #2c2925; cursor: pointer;
  letter-spacing: -0.005em;
  transition: background 140ms ease;
}
.hybl-nav a:hover { background: #e6e0d4; }
.hybl-nav a.active { background: #1a1816; color: #f4f1ec; font-weight: 500; }
.hybl-nav a .ct {
  font-family: var(--mono); font-size: 11px; color: #8a8174;
  font-variant-numeric: tabular-nums; font-weight: 400;
}
.hybl-nav a.active .ct { color: #c9c2b4; }
.hybl-nav a .glyph {
  font-family: var(--mono); font-size: 11px; color: #8a8174; width: 16px;
}
.hybl-nav a.active .glyph { color: #c9c2b4; }
.hybl-nav .dot { width: 6px; height: 6px; border-radius: 50%; background: #3b5680; display: inline-block; margin-right: 9px; }

.hybl-nav .me {
  margin-top: auto;
  display: flex; align-items: center; gap: 10px;
  padding: 14px 8px 2px;
  border-top: 1px solid #e3ddd1;
}
.hybl-nav .me .av {
  width: 28px; height: 28px; border-radius: 50%;
  background: #1a1816; color: #f4f1ec;
  display: grid; place-items: center;
  font-size: 11px; font-weight: 500;
}
.hybl-nav .me .nm { font-size: 13px; font-weight: 500; line-height: 1.2; letter-spacing: -0.005em; }
.hybl-nav .me .ro { font-size: 11px; color: #8a8174; }

/* ── main shell ─────────────────────────────────────────────────── */
.hybl-main {
  display: grid;
  grid-template-rows: 56px 1fr 36px;
  min-height: 0;
  background: #f4f1ec;
}
.hybl-top {
  display: flex; align-items: center; gap: 20px;
  padding: 0 40px;
  border-bottom: 1px solid #e8e2d4;
}
.hybl-top .crumb { font-size: 13px; color: #8a8174; }
.hybl-top .crumb b { color: #1a1816; font-weight: 500; }
.hybl-top .right { margin-left: auto; display: flex; gap: 22px; font-size: 12.5px; color: #8a8174; }
.hybl-top .right .live::before {
  content: ""; display: inline-block;
  width: 6px; height: 6px; border-radius: 50%;
  background: #3b5680; margin-right: 8px;
  vertical-align: middle;
}

.hybl-body {
  padding: 56px 56px 32px;
  overflow: auto;
  display: flex; flex-direction: column; gap: 36px;
}

.hybl-greet {
  display: flex; align-items: end; justify-content: space-between;
  gap: 24px;
}
.hybl-greet .lbl {
  font-family: var(--mono); font-size: 11px;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: #3b5680; margin-bottom: 14px;
}
.hybl-greet h1 {
  font-family: var(--display);
  font-size: 52px;
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1.02;
  color: #1a1816;
  max-width: 22ch;
}
.hybl-greet h1 b { font-weight: 500; color: #3b5680; }
.hybl-greet .sub { font-size: 14.5px; color: #6b6358; margin-top: 14px; max-width: 56ch; line-height: 1.5; }
.hybl-greet .stats {
  display: flex; gap: 28px;
  align-items: flex-end;
}
.hybl-greet .stat {
  text-align: right;
}
.hybl-greet .stat .k {
  font-family: var(--mono); font-size: 10px;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: #8a8174;
}
.hybl-greet .stat .v {
  font-family: var(--display); font-size: 26px; font-weight: 500;
  letter-spacing: -0.02em; color: #1a1816; margin-top: 4px;
  line-height: 1;
}

.hybl-section {
  display: flex; align-items: baseline; justify-content: space-between;
  border-bottom: 1px solid #e8e2d4; padding-bottom: 10px;
}
.hybl-section h2 {
  font-family: var(--mono); font-size: 11px;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: #6b6358; font-weight: 500;
}
.hybl-section .more { font-size: 13px; color: #3b5680; cursor: pointer; font-weight: 500; }

/* footer */
.hybl-foot {
  display: flex; align-items: center; gap: 24px;
  padding: 0 40px;
  border-top: 1px solid #e8e2d4;
  font-family: var(--mono); font-size: 11px;
  color: #8a8174; letter-spacing: 0.04em;
}
.hybl-foot .right { margin-left: auto; display: flex; gap: 22px; }

/* ─────────────────────────────────────────────────────────────────
   VARIANT A — "Aperture": soft cards, layered depth, hairline rule
   ───────────────────────────────────────────────────────────────── */
.va .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.va .card {
  background: #fff;
  border-radius: 14px;
  padding: 22px;
  display: flex; flex-direction: column; gap: 16px;
  min-height: 192px;
  position: relative;
  cursor: pointer;
  border: 1px solid #ebe6dc;
  box-shadow:
    0 1px 0 rgba(26,24,22,0.02),
    0 1px 3px rgba(26,24,22,0.04),
    0 8px 24px -8px rgba(26,24,22,0.06);
  transition: transform 220ms cubic-bezier(.2,.7,.2,1),
              box-shadow 220ms cubic-bezier(.2,.7,.2,1),
              border-color 220ms ease;
}
.va .card:hover {
  transform: translateY(-2px);
  border-color: #d8d2c7;
  box-shadow:
    0 1px 0 rgba(26,24,22,0.03),
    0 4px 8px rgba(26,24,22,0.06),
    0 22px 38px -12px rgba(26,24,22,0.12);
}
.va .card .top {
  display: flex; align-items: center; justify-content: space-between;
}
.va .card .glyph {
  width: 36px; height: 36px; border-radius: 10px;
  background: linear-gradient(180deg, #f7f3eb 0%, #efeae1 100%);
  display: grid; place-items: center;
  font-family: var(--display); font-size: 14px; font-weight: 600;
  color: #1a1816; letter-spacing: -0.02em;
  border: 1px solid #ebe6dc;
}
.va .card.featured .glyph {
  background: linear-gradient(180deg, #4a679a 0%, #3b5680 100%);
  color: #f4f1ec; border-color: transparent;
  box-shadow: 0 4px 10px -2px rgba(59, 86, 128, 0.35), inset 0 1px 0 rgba(255,255,255,0.18);
}
.va .card .live {
  font-family: var(--mono); font-size: 10px;
  color: #3b5680; letter-spacing: 0.08em;
  display: flex; align-items: center; gap: 6px;
}
.va .card .live::before {
  content: ""; width: 6px; height: 6px; border-radius: 50%;
  background: #3b5680;
  box-shadow: 0 0 0 0 rgba(59,86,128,0.5);
  animation: va-pulse 1.8s ease-out infinite;
}
@keyframes va-pulse {
  0% { box-shadow: 0 0 0 0 rgba(59,86,128,0.45); }
  70% { box-shadow: 0 0 0 7px rgba(59,86,128,0); }
  100% { box-shadow: 0 0 0 0 rgba(59,86,128,0); }
}
.va .card .name {
  font-family: var(--display); font-size: 19px; font-weight: 500;
  letter-spacing: -0.018em; color: #1a1816; line-height: 1.15;
}
.va .card .desc {
  font-size: 13px; color: #6b6358; line-height: 1.45; flex: 1;
}
.va .card .foot {
  display: flex; justify-content: space-between; align-items: center;
  border-top: 1px solid #f0ebdf; padding-top: 12px;
  font-family: var(--mono); font-size: 11px; color: #8a8174;
  font-variant-numeric: tabular-nums;
}
.va .card .foot .arrow {
  width: 22px; height: 22px; border-radius: 50%;
  display: grid; place-items: center;
  background: #f4f1ec; color: #1a1816;
  transition: background 200ms ease, transform 200ms ease;
}
.va .card:hover .foot .arrow { background: #1a1816; color: #f4f1ec; transform: translateX(2px); }

/* ─────────────────────────────────────────────────────────────────
   VARIANT B — "Marble": tall portrait cards, gradient veil, ultra-quiet
   ───────────────────────────────────────────────────────────────── */
.vb .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.vb .card {
  position: relative;
  border-radius: 18px;
  padding: 26px 24px;
  min-height: 256px;
  display: flex; flex-direction: column; gap: 20px;
  cursor: pointer;
  background:
    radial-gradient(120% 80% at 100% 0%, rgba(59, 86, 128, 0.045) 0%, transparent 60%),
    linear-gradient(180deg, #fbf9f4 0%, #f4f1ec 100%);
  border: 1px solid #ebe6dc;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.6),
    0 1px 2px rgba(26,24,22,0.04),
    0 12px 30px -14px rgba(26,24,22,0.08);
  overflow: hidden;
  transition: transform 260ms cubic-bezier(.2,.7,.2,1),
              box-shadow 260ms cubic-bezier(.2,.7,.2,1);
}
.vb .card::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  border-radius: 18px;
  background: radial-gradient(80% 60% at 0% 100%, rgba(59,86,128,0.06) 0%, transparent 70%);
  opacity: 0; transition: opacity 320ms ease;
}
.vb .card:hover {
  transform: translateY(-3px);
  background:
    radial-gradient(120% 90% at 100% 0%, rgba(255,255,255,0.10) 0%, transparent 65%),
    linear-gradient(180deg, #4a679a 0%, #2f4670 100%);
  border-color: transparent;
  color: #f4f1ec;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.18),
    0 6px 14px -4px rgba(47,70,112,0.35),
    0 22px 44px -10px rgba(47,70,112,0.35);
}
.vb .card:hover::after { opacity: 0; }
.vb .card:hover .meta { color: #b8c6dd; }
.vb .card:hover .meta .live { color: #f4f1ec; }
.vb .card:hover .meta .live::before { background: #f4f1ec; }
.vb .card:hover .nm { color: #f4f1ec; }
.vb .card:hover .desc { color: #d6dceb; }
.vb .card:hover .row { border-top-color: rgba(244,241,236,0.2); }
.vb .card:hover .row .pair .k { color: #b8c6dd; }
.vb .card:hover .row .pair .v { color: #f4f1ec; }
.vb .card:hover .row .go { background: #f4f1ec; color: #1a1816; }

.vb .card .meta {
  display: flex; align-items: center; justify-content: space-between;
  font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: #8a8174;
}
.vb .card .meta .live {
  display: inline-flex; align-items: center; gap: 6px;
  color: #3b5680;
}
.vb .card .meta .live::before {
  content: ""; width: 6px; height: 6px; border-radius: 50%; background: #3b5680;
  animation: va-pulse 1.8s ease-out infinite;
}
.vb .card .nm {
  font-family: var(--display); font-size: 30px; font-weight: 400;
  letter-spacing: -0.028em; line-height: 1;
  color: #1a1816;
  margin-top: auto;
}
.vb .card .desc {
  font-size: 13px; color: #6b6358; line-height: 1.5; max-width: 30ch;
}
.vb .card .row {
  display: flex; align-items: end; justify-content: space-between;
  gap: 14px;
  padding-top: 16px; border-top: 1px solid #ebe6dc;
}
.vb .card .row .pair { display: flex; flex-direction: column; gap: 3px; }
.vb .card .row .pair .k { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #8a8174; }
.vb .card .row .pair .v { font-family: var(--display); font-size: 22px; font-weight: 500; letter-spacing: -0.02em; color: #1a1816; line-height: 1; }
.vb .card .row .go {
  width: 32px; height: 32px; border-radius: 50%;
  display: grid; place-items: center;
  background: #1a1816; color: #f4f1ec; font-size: 14px;
  transition: transform 220ms ease;
}
.vb .card:hover .row .go { transform: translateX(3px); }

.vb .card.feat {
  background:
    radial-gradient(120% 90% at 100% 0%, rgba(255,255,255,0.10) 0%, transparent 65%),
    linear-gradient(180deg, #4a679a 0%, #2f4670 100%);
  color: #f4f1ec;
  border-color: transparent;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.18),
    0 6px 14px -4px rgba(47,70,112,0.35),
    0 22px 44px -10px rgba(47,70,112,0.35);
}
.vb .card.feat .meta { color: #b8c6dd; }
.vb .card.feat .meta .live { color: #f4f1ec; }
.vb .card.feat .meta .live::before { background: #f4f1ec; }
.vb .card.feat .nm { color: #f4f1ec; }
.vb .card.feat .desc { color: #d6dceb; }
.vb .card.feat .row { border-top-color: rgba(244,241,236,0.2); }
.vb .card.feat .row .pair .k { color: #b8c6dd; }
.vb .card.feat .row .pair .v { color: #f4f1ec; }
.vb .card.feat .row .go { background: #f4f1ec; color: #1a1816; }

/* ─────────────────────────────────────────────────────────────────
   VARIANT C — "Pebble": pill-shaped horizontal cards, in-card sparkline
   ───────────────────────────────────────────────────────────────── */
.vc .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
.vc .card {
  background: #fff;
  border-radius: 999px 16px 16px 999px;
  padding: 18px 26px 18px 18px;
  display: grid; grid-template-columns: 56px 1fr 140px 36px;
  gap: 18px; align-items: center;
  border: 1px solid #ebe6dc;
  box-shadow: 0 1px 2px rgba(26,24,22,0.03), 0 6px 18px -8px rgba(26,24,22,0.06);
  cursor: pointer;
  transition: transform 240ms cubic-bezier(.2,.7,.2,1),
              box-shadow 240ms cubic-bezier(.2,.7,.2,1);
}
.vc .card:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 4px rgba(26,24,22,0.05), 0 18px 36px -12px rgba(26,24,22,0.14);
}
.vc .card .glyph {
  width: 56px; height: 56px; border-radius: 50%;
  background: linear-gradient(180deg, #f7f3eb 0%, #ebe6dc 100%);
  display: grid; place-items: center;
  font-family: var(--display); font-weight: 500; font-size: 19px;
  letter-spacing: -0.025em; color: #1a1816;
  border: 1px solid #e3ddd1;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
}
.vc .card.feat .glyph {
  background: linear-gradient(180deg, #4a679a 0%, #3b5680 100%);
  color: #f4f1ec; border-color: transparent;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.2),
              0 4px 10px -2px rgba(59, 86, 128, 0.4);
}
.vc .card .body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.vc .card .body .row1 {
  display: flex; gap: 10px; align-items: baseline;
  font-family: var(--display); font-size: 18px; font-weight: 500;
  letter-spacing: -0.016em; color: #1a1816;
}
.vc .card .body .row1 .live {
  font-family: var(--mono); font-size: 10px; color: #3b5680;
  letter-spacing: 0.1em;
  display: inline-flex; align-items: center; gap: 5px;
  font-weight: 400;
}
.vc .card .body .row1 .live::before {
  content: ""; width: 5px; height: 5px; border-radius: 50%; background: #3b5680;
  animation: va-pulse 1.8s ease-out infinite;
}
.vc .card .body .desc {
  font-size: 12.5px; color: #6b6358; line-height: 1.4;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.vc .card .stats {
  display: flex; gap: 14px; align-items: center;
  font-family: var(--mono); font-size: 11px; color: #8a8174;
  font-variant-numeric: tabular-nums;
}
.vc .card .stats .v {
  font-family: var(--display); font-size: 17px; font-weight: 500;
  letter-spacing: -0.015em; color: #1a1816;
}
.vc .card .spark {
  height: 24px; width: 70px;
}
.vc .card .arrow {
  width: 32px; height: 32px; border-radius: 50%;
  background: #f4f1ec; color: #1a1816;
  display: grid; place-items: center;
  border: 1px solid #ebe6dc;
  font-size: 13px;
  transition: background 200ms ease, color 200ms ease, transform 200ms ease;
}
.vc .card:hover .arrow { background: #1a1816; color: #f4f1ec; border-color: #1a1816; transform: translateX(3px); }

.vc .card.feat { background: linear-gradient(180deg, #fbf9f4 0%, #f4f1ec 100%); }
`;

const departments = [
{ name: "Commercial", short: "C", desc: "[ description ]", count: 12, live: 4, savedH: 142, sla: 2 },
{ name: "Public Sector", short: "S", desc: "[ description ]", count: 2, live: 0, savedH: 18, sla: 0 },
{ name: "Government Relations & Regulatory Affairs", short: "G", desc: "[ description ]", count: 3, live: 1, savedH: 31, sla: 0 },
{ name: "Mergers & Acquisitions", short: "M", desc: "[ description ]", count: 4, live: 1, savedH: 88, sla: 1 },
{ name: "Privacy", short: "P", desc: "[ description ]", count: 6, live: 2, savedH: 64, sla: 0 },
{ name: "Product", short: "Pr", desc: "[ description ]", count: 5, live: 2, savedH: 52, sla: 0 },
{ name: "Compliance", short: "Co", desc: "[ description ]", count: 4, live: 1, savedH: 38, sla: 1 },
{ name: "Operations", short: "O", desc: "[ description ]", count: 3, live: 0, savedH: 22, sla: 0 }];


const departmentsPair = [
departments[0], departments[1], departments[2], departments[3], departments[5], departments[4]];


function HybridShell({ variantClass, children }) {
  return (
    <div className={`ab hybl ${variantClass}`} data-screen-label={`Atrium hybrid · ${variantClass}`}>
      <style>{hybridLandingCss}</style>

      <nav className="hybl-nav">
        <div className="brand">legalOS</div>

        <div className="group">
          <a className="active"><span><span className="glyph"></span>Workspace</span><span className="ct">⌘1</span></a>
        </div>

        <div className="group">
          <div className="lbl">AGENT DEPARTMENTS</div>
          {departments.map((d) =>
          <a key={d.name}>
              <span><span className="glyph"></span>{d.name}</span>
              <span className="ct">{d.count}</span>
            </a>
          )}
        </div>

        <div className="group">
          <a><span><span className="glyph"></span>Knowledge</span><span className="ct"></span></a>
          <a><span><span className="glyph"></span>Matters / Deals</span><span className="ct">23</span></a>
          <a><span><span className="glyph"></span>Inbox</span><span className="ct">14</span></a>
          <a><span><span className="glyph"></span>Resources</span><span className="ct"></span></a>
        </div>

        <div className="me">
          <div className="av">JO</div>
          <div>
            <div className="nm">Jola Okafor</div>
            <div className="ro">Counsel · Commercial</div>
          </div>
        </div>
      </nav>

      <div className="hybl-main">
        <header className="hybl-top">
          <div className="crumb">workspace / <b>departments</b></div>
          <div className="right">
            <span className="live"></span>
            <span>Friday · May 1</span>
          </div>
        </header>

        <div className="hybl-body">
          <div className="hybl-greet">
            <div>
              <div className="lbl">Workspace</div>
              <h1>Good morning, Jola. <b>Two redlines</b> are waiting on you.</h1>
              <p className="sub">Eight agents are working across eight departments. Pick a department to pivot in, or jump straight to a pinned matter.</p>
            </div>
            <div className="stats">
              <div className="stat"><div className="k">Open</div><div className="v">23</div></div>
              <div className="stat"><div className="k">SLA at risk</div><div className="v">2</div></div>
              <div className="stat"><div className="k">Saved · MTD</div><div className="v">142h</div></div>
            </div>
          </div>

          <div className="hybl-section">
            <h2>AGENT DEPARTMENTS</h2>
            <span className="more">customize layout →</span>
          </div>

          <div className="grid">
            {children}
          </div>
        </div>

        <footer className="hybl-foot">
          <span>⌘K to command</span>
          <span>⌘1 brief · ⌘M matters · ⌘A agents</span>
          <div className="right">
            <span>privilege enforced</span>
            <span>build 26.04</span>
          </div>
        </footer>
      </div>
    </div>);

}

/* Sparkline for variant C */
function Spark({ d, accent }) {
  return (
    <svg className="spark" viewBox="0 0 70 24" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={accent ? "#3b5680" : "#8a8174"} strokeWidth="1.4" strokeLinecap="round" />
    </svg>);

}

/* ── A — Aperture ─────────────────────────────────────────────── */
function VariantAperture() {
  return (
    <HybridShell variantClass="va">
      {departments.map((d) =>
      <div key={d.name} className="card">
          <div className="name">{d.name}</div>
          <div className="desc">{d.desc}</div>
          <div className="foot">
            <span>{d.count} matters · {d.savedH}h saved</span>
            <span className="arrow">→</span>
          </div>
        </div>
      )}
    </HybridShell>);

}

/* ── B — Marble ──────────────────────────────────────────────── */
function VariantMarble() {
  return (
    <HybridShell variantClass="vb">
      {departments.map((d) =>
      <div key={d.name} className="card">
          <div className="meta">
            <span>{d.count} matters</span>
            {d.live > 0 ? <span className="live">{d.live} live</span> : <span>idle</span>}
          </div>
          <div className="nm">{d.name}</div>
          <div className="desc">{d.desc}</div>
          <div className="row">
            <div className="pair"><span className="k">Saved · MTD</span><span className="v">{d.savedH}h</span></div>
            <div className="pair"><span className="k">SLA risk</span><span className="v">{d.sla}</span></div>
            <span className="go">→</span>
          </div>
        </div>
      )}
    </HybridShell>);

}

/* ── C — Pebble ──────────────────────────────────────────────── */
const sparkPaths = [
"M0,18 L10,16 L18,12 L26,14 L34,9 L42,11 L50,6 L58,8 L70,3",
"M0,14 L10,15 L18,13 L26,10 L34,12 L42,8 L50,11 L58,7 L70,5",
"M0,12 L10,10 L18,14 L26,11 L34,13 L42,9 L50,10 L58,8 L70,9",
"M0,16 L10,14 L18,15 L26,11 L34,12 L42,13 L50,10 L58,11 L70,9",
"M0,15 L10,13 L18,11 L26,13 L34,10 L42,11 L50,9 L58,7 L70,6",
"M0,18 L10,17 L18,15 L26,16 L34,14 L42,13 L50,11 L58,10 L70,8"];


function VariantPebble() {
  return (
    <HybridShell variantClass="vc">
      {departmentsPair.map((d, i) =>
      <div key={d.name} className={`card ${d.featured ? "feat" : ""}`}>
          <div className="glyph">{d.short}</div>
          <div className="body">
            <div className="row1">
              <span>{d.name}</span>
              {d.live > 0 && <span className="live">{d.live} live</span>}
            </div>
            <div className="desc">{d.desc}</div>
          </div>
          <div className="stats">
            <div><span className="v">{d.count}</span> open</div>
            <Spark d={sparkPaths[i % sparkPaths.length]} accent={d.featured} />
            <div><span className="v">{d.savedH}h</span></div>
          </div>
          <div className="arrow">→</div>
        </div>
      )}
    </HybridShell>);

}

window.VariantAperture = VariantAperture;
window.VariantMarble = VariantMarble;
window.VariantPebble = VariantPebble;
window.hybridLandingCss = hybridLandingCss;