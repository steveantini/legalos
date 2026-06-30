/* ═══════════════════════════════════════════════════════════════════════
   legalOS — real product tokens, chrome primitives, and the app-window shell.
   Tokens lifted verbatim from app/globals.css :root (the Aperture palette).
   Fonts: Inter Tight (display) + Geist Mono (mono), as the product ships.
   ═══════════════════════════════════════════════════════════════════════ */
const T = {
  bg:        "oklch(0.9712 0.0074 80.7209)",   /* paper canvas */
  ink:       "oklch(0.2106 0.0050 67.5509)",   /* foreground */
  ink2:      "oklch(0.2827 0.0084 75.2446)",
  card:      "oklch(0.9993 0.0046 80.7209)",   /* warm near-white card */
  paper2:    "oklch(0.9995 0.0069 88.6418)",   /* recessed ground */
  primary:   "oklch(0.4512 0.0766 258.9642)",  /* accent navy #3b5680 */
  primaryHi: "oklch(0.5141 0.0884 261.1831)",
  primaryFg: "oklch(0.9841 0.0074 80.7209)",
  secondary: "oklch(0.9635 0.0132 82.4017)",   /* stone */
  mute:      "oklch(0.5038 0.0198 75.9505)",   /* muted-foreground */
  caption:   "oklch(0.6074 0.0221 77.2148)",
  hair:      "oklch(0.9319 0.0198 87.5179)",   /* hairline */
  hairStrong:"oklch(0.9240 0.0174 84.5888)",
  divider:   "oklch(0.9657 0.0169 88.0008)",
  border:    "oklch(0.9511 0.0144 84.5843)",
  citeBg:    "oklch(0.4512 0.0766 258.9642 / 0.08)",
  citeBorder:"oklch(0.4512 0.0766 258.9642 / 0.18)",
  warn:      "oklch(0.4568 0.1098 22.4083)",
  sans: '"Inter Tight", system-ui, -apple-system, sans-serif',
  mono: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};
window.T = T;

const LOS_CSS = `
  .los, .los *{ box-sizing:border-box; }
  .los{ font-family:${T.sans}; color:${T.ink}; -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; }
  .los button{ font-family:inherit; cursor:pointer; border:none; background:none; }
  .los a{ text-decoration:none; color:inherit; }
  .los ::selection{ background:${T.citeBg}; }
  .los-lift{ transition:transform .36s cubic-bezier(.23,1,.43,1), box-shadow .36s cubic-bezier(.23,1,.43,1), border-color .36s ease; }
  .los-lift:hover{ transform:translateY(-2px); border-color:color-mix(in oklab, ${T.primary} 35%, transparent);
    box-shadow:0 1px 0 rgba(26,24,22,.03),0 4px 8px rgba(26,24,22,.06),0 22px 38px -12px rgba(26,24,22,.12),0 8px 24px -8px rgba(59,86,128,.12); }
  .los-navrow{ transition:background .12s ease, color .12s ease; }
  .los-navrow:hover{ background:${T.hair}; }
  .los-cta{ transition:transform .2s ease, background .2s ease, box-shadow .2s ease; }
  .los-cta:hover{ transform:translateY(-1px); background:${T.ink2}; }
  @keyframes los-ring{ 0%{ transform:scale(.18); opacity:0 } 12%{ opacity:.5 } 70%{ opacity:.05 } 100%{ transform:scale(1.05); opacity:0 } }

  .los-prow{ display:grid; gap:52px; align-items:center; grid-template-columns:1.95fr 1fr; }
  .los-prow.rev{ grid-template-columns:1fr 1.95fr; }
  .los-prow.rev .los-win{ order:2; }
  .los-prow.rev .los-text{ order:1; align-items:flex-end; text-align:right; }
  .los-text{ display:flex; flex-direction:column; gap:16px; align-items:flex-start; text-align:left; }
  @media (max-width:1180px){
    .los-prow, .los-prow.rev{ grid-template-columns:1fr; gap:30px; }
    .los-prow .los-win, .los-prow.rev .los-win{ order:2; }
    .los-prow .los-text, .los-prow.rev .los-text{ order:1; align-items:flex-start; text-align:left; }
  }
`;
function LosStyle(){ return <style dangerouslySetInnerHTML={{ __html: LOS_CSS }} />; }
window.LosStyle = LosStyle;

/* ── primitives ──────────────────────────────────────────────────────── */
const Mono = ({ children, c = T.caption, s = 11, ls = ".16em", style }) => (
  <span style={{ font: `500 ${s}px/1.3 ${T.mono}`, letterSpacing: ls, textTransform: "uppercase", color: c, ...style }}>{children}</span>
);
window.Mono = Mono;

/* the product wordmark — preserves its casing even inside caps contexts */
const Brand = ({ s = 15, style }) => (
  <span style={{ font: `600 ${s}px/1 ${T.sans}`, letterSpacing: "-.015em", textTransform: "none", color: T.ink, ...style }}>legalOS</span>
);
window.Brand = Brand;

/* the landing glyph — concentric rings + accent dot + a quiet pulse */
function Glyph({ size = 200 }) {
  return (
    <div aria-hidden style={{ width: size, height: size, position: "relative" }}>
      <svg viewBox="0 0 220 220" width={size} height={size}>
        <defs>
          <radialGradient id="los-gg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={T.primary} stopOpacity="0.30"/>
            <stop offset="50%" stopColor={T.primary} stopOpacity="0.09"/>
            <stop offset="100%" stopColor={T.primary} stopOpacity="0"/>
          </radialGradient>
        </defs>
        <circle cx="110" cy="110" r="100" fill="url(#los-gg)"/>
        {[92, 64, 36].map((r) => <circle key={r} cx="110" cy="110" r={r} fill="none" stroke={T.primary} strokeOpacity="0.18" strokeWidth="1"/>)}
        {[0, 1.4, 2.8].map((d, i) => (
          <circle key={i} cx="110" cy="110" r="92" fill="none" stroke={T.primary} strokeWidth="1"
            style={{ transformBox: "fill-box", transformOrigin: "center", animation: `los-ring 4.2s cubic-bezier(.2,.6,.2,1) ${d}s infinite both` }}/>
        ))}
        <circle cx="110" cy="110" r="6" fill={T.primary}/>
      </svg>
    </div>
  );
}
window.Glyph = Glyph;

const Avatar = ({ initials = "SA", size = 30 }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: T.ink, color: T.primaryFg, display: "grid", placeItems: "center", font: `500 ${size * 0.36}px/1 ${T.sans}`, flexShrink: 0 }}>{initials}</div>
);
window.Avatar = Avatar;

/* ── app-window shell: compact rail + top bar + main ─────────────────── */
const DEPTS = ["Commercial", "Corporate", "Privacy", "Litigation", "Intellectual Property"];

function NavRow({ children, active, caption, sub }) {
  if (caption) return <div style={{ padding: "0 8px", marginBottom: 8 }}><Mono s={10.5} ls=".16em" c={T.caption}>{children}</Mono></div>;
  return (
    <div className="los-navrow" style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "7px 10px", borderRadius: 8, cursor: "pointer",
      background: active ? T.ink : "transparent", color: active ? T.primaryFg : T.ink2 }}>
      <span style={{ font: `${active ? 500 : 450} 13px/1.2 ${T.sans}`, letterSpacing: "-.005em" }}>{children}</span>
      {sub ? <Mono s={9} ls=".06em" c={active ? "color-mix(in oklab, white 70%, transparent)" : T.caption}>{sub}</Mono> : null}
    </div>
  );
}

function Rail({ active }) {
  return (
    <nav style={{ width: 196, flexShrink: 0, display: "flex", flexDirection: "column", gap: 20,
      borderRight: `1px solid ${T.hair}`, background: T.bg, padding: "20px 12px", alignSelf: "stretch" }}>
      <div className="los-navrow" style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 8px 6px", borderRadius: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.primary }}/>
        <Brand/>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <NavRow caption>Departments</NavRow>
        {DEPTS.map((d) => <NavRow key={d} active={active === "departments" && d === "Commercial"}>{d}</NavRow>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <NavRow caption>Knowledge</NavRow>
        <NavRow active={active === "knowledge"}>Research</NavRow>
        <NavRow active={active === "knowledge-sq"}>Structured Query</NavRow>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <NavRow caption>Workflows</NavRow>
        <NavRow active={active === "workflows"}>My Workflows</NavRow>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <NavRow caption>Help</NavRow>
        <NavRow>Guides</NavRow>
      </div>
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, padding: "8px", borderTop: `1px solid ${T.hair}` }}>
        <Avatar initials="SA" size={30}/>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ font: `500 12.5px/1.1 ${T.sans}`, color: T.ink }}>Steven Antini</span>
          <Mono s={9} ls=".08em" c={T.caption}>GENERAL COUNSEL</Mono>
        </div>
      </div>
    </nav>
  );
}

/* admin-mode rail — GOVERN + MEASURE, mirroring the shipping AdminRail */
function AdminRail({ active }) {
  return (
    <nav style={{ width: 196, flexShrink: 0, display: "flex", flexDirection: "column", gap: 20,
      borderRight: `1px solid ${T.hair}`, background: T.bg, padding: "20px 12px", alignSelf: "stretch" }}>
      <div className="los-navrow" style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 8px 6px", borderRadius: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.primary }}/>
        <Brand/>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <NavRow active={active === "admin"}>Admin</NavRow>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <NavRow caption>Govern</NavRow>
        <NavRow active={active === "people"}>People</NavRow>
        <NavRow active={active === "policy"}>Policy &amp; access</NavRow>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <NavRow caption>Measure</NavRow>
        <NavRow active={active === "insights"}>Insights</NavRow>
        <NavRow active={active === "evals"}>Evals</NavRow>
      </div>
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, padding: "8px", borderTop: `1px solid ${T.hair}` }}>
        <Avatar initials="SA" size={30}/>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ font: `500 12.5px/1.1 ${T.sans}`, color: T.ink }}>Steven Antini</span>
          <Mono s={9} ls=".08em" c={T.caption}>ADMIN · OWNER</Mono>
        </div>
      </div>
    </nav>
  );
}

function TopBar({ crumbs }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, height: 52, flexShrink: 0,
      borderBottom: `1px solid ${T.hair}`, padding: "0 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <span style={{ color: T.hairStrong, font: `400 13px/1 ${T.sans}` }}>/</span> : null}
            <span style={{ font: `${i === crumbs.length - 1 ? 500 : 430} 13px/1 ${T.sans}`, color: i === crumbs.length - 1 ? T.ink : T.mute }}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div style={{ marginLeft: "auto" }}><Mono s={11} ls=".06em" c={T.caption} style={{ textTransform: "none" }}>Monday · Jun 29</Mono></div>
    </div>
  );
}

/* The full product window: chrome panel wrapping rail + top bar + surface. */
function AppWindow({ active, crumbs, rail, children }) {
  return (
    <div className="los" style={{ borderRadius: 16, overflow: "hidden", background: T.bg,
      border: `1px solid ${T.hairStrong}`,
      boxShadow: "0 1px 2px rgba(26,24,22,.04), 0 2px 8px -2px rgba(26,24,22,.05), 0 50px 80px -44px rgba(40,52,80,.34)",
      display: "flex", minHeight: 440 }}>
      {rail === "admin" ? <AdminRail active={active}/> : <Rail active={active}/>}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: T.bg }}>
        <TopBar crumbs={crumbs}/>
        <div style={{ flex: 1, padding: "26px 28px 30px", minWidth: 0 }}>{children}</div>
      </div>
    </div>
  );
}
window.AppWindow = AppWindow;
