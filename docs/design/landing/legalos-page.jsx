/* ═══════════════════════════════════════════════════════════════════════
   legalOS — the marketing landing page, with the Platform section (the four
   full product windows) sitting under the hero CTA and above the footer.
   Chrome (topbar / hero / footer) recreates the shipping landing surface.
   ═══════════════════════════════════════════════════════════════════════ */
const { useState, useEffect, useRef } = React;

/* ── top bar ─────────────────────────────────────────────────────────── */
function Topbar() {
  return (
    <header style={{ padding: "28px 40px 0" }}>
      <div style={{ maxWidth: 1340, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.primary }}/>
          <Brand/>
        </div>
        <Mono s={11} ls=".16em" c={T.caption} style={{ textTransform: "none", letterSpacing: ".06em" }}>Monday · Jun 29</Mono>
      </div>
    </header>
  );
}

/* ── hero ────────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section style={{ padding: "84px 40px 76px" }}>
      <div style={{ position: "relative", maxWidth: 1340, margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14, maxWidth: 1100 }}>
        <Mono s={11} ls=".16em" c={T.primary}>BETA · <span style={{ textTransform: "none" }}>v0.1.0</span></Mono>
        <h1 style={{ margin: 0, font: `400 64px/1.04 ${T.sans}`, letterSpacing: "-.03em", color: T.ink, maxWidth: "20ch", textWrap: "balance" }}>
          Welcome to <span style={{ fontWeight: 500, color: T.primary }}>legalOS</span>, your connected workspace and legal department operating system.
        </h1>
        <p style={{ margin: "14px 0 0", font: `400 16px/1.55 ${T.sans}`, color: T.mute, maxWidth: "56ch" }}>
          One place for the agents, workflows, and tools your team uses every day, built around how legal work actually happens.
        </p>
        <div style={{ marginTop: 36, display: "flex", alignItems: "center", gap: 18 }}>
          <button className="los-cta" style={{ display: "inline-flex", alignItems: "center", gap: 10, borderRadius: 12,
            background: T.ink, color: T.primaryFg, padding: "16px 22px 16px 26px", font: `500 15px/1 ${T.sans}`,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08),0 1px 0 rgba(0,0,0,0.12),0 8px 24px rgba(0,0,0,0.12)" }}>
            Enter workspace
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
          </button>
          <Mono s={11} ls=".12em" c={T.caption}>REQUEST ACCESS <span style={{ textTransform: "none", letterSpacing: ".02em", color: T.primary }}>→</span></Mono>
        </div>
      </div>
        <div style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><Glyph size={210}/></div>
      </div>
    </section>
  );
}

/* ── the Platform section (the new work) ─────────────────────────────── */
const AREAS = [
  { num: "01", eyebrow: "WORKSPACE", title: "The daily home", active: "home", crumbs: ["Home"],
    desc: "Everything waiting for you the moment you sit down: saved hours, saved spend, and the work your agents ran overnight.",
    Surface: WorkspaceSurface },
  { num: "02", eyebrow: "DEPARTMENTS", title: "Agents, organized like a team", active: "departments", crumbs: ["Departments"],
    desc: "Your AI counsel arranged by the practice areas you already run. Structure and breadth, at a glance.",
    Surface: DepartmentsSurface },
  { num: "03", eyebrow: "KNOWLEDGE", title: "Ask your own documents", active: "knowledge-sq", crumbs: ["Knowledge", "Structured Query"],
    desc: "Reasoned research alongside exact, repeatable answers you can check. The precision you can verify.",
    Surface: KnowledgeSurface },
  { num: "04", eyebrow: "WORKFLOWS", title: "Work that waits for you", active: "workflows", crumbs: ["Workflows", "Renewal sweep"],
    desc: "Multi-step legal work that runs on its own, yet always pauses for human approval. Automation that keeps you in command.",
    Surface: WorkflowsSurface },
];

function AreaText({ a }) {
  return (
    <div className="los-text">
      <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
        <Mono s={11} ls=".12em" c={T.caption}>{a.num}</Mono>
        <span style={{ width: 22, height: 1, background: T.hairStrong }}/>
        <Mono s={11} ls=".2em" c={T.primary}>{a.eyebrow}</Mono>
      </span>
      <h3 style={{ margin: 0, font: `400 28px/1.14 ${T.sans}`, letterSpacing: "-.025em", color: T.ink, maxWidth: "15ch" }}>{a.title}</h3>
      <p style={{ margin: 0, font: `400 15px/1.6 ${T.sans}`, color: T.mute, maxWidth: "38ch" }}>{a.desc}</p>
    </div>
  );
}

function PlatformSection() {
  return (
    <section style={{ borderTop: `1px solid ${T.hair}`, padding: "76px 40px 84px" }}>
      <div style={{ maxWidth: 1340, margin: "0 auto", display: "flex", flexDirection: "column", gap: 60 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
          <Mono s={11} ls=".2em" c={T.primary}>INSIDE THE PLATFORM</Mono>
          <h2 style={{ margin: 0, font: `400 42px/1.08 ${T.sans}`, letterSpacing: "-.03em", color: T.ink, maxWidth: "24ch" }}>
            Everything your department runs on, in <span style={{ fontWeight: 500, color: T.primary }}>one place</span>.
          </h2>
          <p style={{ margin: 0, font: `400 16px/1.55 ${T.sans}`, color: T.mute, maxWidth: "58ch" }}>
            Four connected surfaces: your workspace, your departments, your knowledge, and your workflows. Here is how each one actually works.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 64 }}>
          {AREAS.map((a, i) => (
            <div key={a.num} className={`los-prow${i % 2 === 0 ? "" : " rev"}`}>
              <div className="los-win"><AppWindow active={a.active} crumbs={a.crumbs}><a.Surface/></AppWindow></div>
              <AreaText a={a}/>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── "Control on your terms" band — flexibility + the backend ────────── */
function Chip({ children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", font: `450 12.5px/1 ${T.sans}`, color: T.ink2,
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px" }}>{children}</span>
  );
}
function StackFacet({ tag, title, body, chips }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Mono s={11} ls=".18em" c={T.primary}>{tag}</Mono>
      <h3 style={{ margin: 0, font: `450 21px/1.2 ${T.sans}`, letterSpacing: "-.02em", color: T.ink }}>{title}</h3>
      <p style={{ margin: 0, font: `400 14.5px/1.6 ${T.sans}`, color: T.mute, maxWidth: "36ch" }}>{body}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>{chips.map((c) => <Chip key={c}>{c}</Chip>)}</div>
    </div>
  );
}
function ControlSection() {
  return (
    <section style={{ borderTop: `1px solid ${T.hair}`, background: T.paper2, padding: "76px 40px 84px" }}>
      <div style={{ maxWidth: 1340, margin: "0 auto", display: "flex", flexDirection: "column", gap: 52 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
          <Mono s={11} ls=".2em" c={T.primary}>CONTROL ON YOUR TERMS</Mono>
          <h2 style={{ margin: 0, font: `400 42px/1.08 ${T.sans}`, letterSpacing: "-.03em", color: T.ink, maxWidth: "22ch" }}>
            Meets your department <span style={{ fontWeight: 500, color: T.primary }}>where it already is</span>.
          </h2>
          <p style={{ margin: 0, font: `400 17px/1.55 ${T.sans}`, color: T.mute, maxWidth: "54ch" }}>
            Model-agnostic, drive-agnostic, and governed by default. legalOS runs on the models you choose, reaches the
            systems you already run, and gives whoever runs it real control.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 48 }}>
          <StackFacet tag="MODEL-AGNOSTIC" title="Run on the models you choose"
            body="Managed, or bring your own provider account, under your own agreement and data boundary. No single engine wired in, no lock-in."
            chips={["Claude", "GPT", "Gemini", "Llama", "Your key"]}/>
          <StackFacet tag="CONNECT YOUR DRIVES" title="Point it at the drives you use"
            body="Ask across folders in your connected drives. Files never move, and their contents are never stored, only a metadata inventory."
            chips={["Google Drive", "SharePoint", "iManage", "NetDocuments", "Box"]}/>
          <StackFacet tag="GOVERNED BY DEFAULT" title="Reads free, writes pause for you"
            body="Every action that changes something outside legalOS pauses for approval, in every autonomy mode. Credentials encrypted, never in the browser."
            chips={["SSO", "Role-based access", "Audit log"]}/>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          <div className="los-text" style={{ maxWidth: "44ch" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
              <Mono s={11} ls=".2em" c={T.primary}>THE BACKEND</Mono>
            </span>
            <h3 style={{ margin: 0, font: `400 28px/1.14 ${T.sans}`, letterSpacing: "-.025em", color: T.ink }}>Built for the people who run it</h3>
            <p style={{ margin: 0, font: `400 16px/1.6 ${T.sans}`, color: T.mute, maxWidth: "52ch" }}>
              One control center to govern access and measure adoption, on real usage. Least-privilege roles, per-connection
              permissions, and a readable audit log of every change.
            </p>
          </div>
          <div className="los-win"><AppWindow rail="admin" active="admin" crumbs={["Admin"]}><AdminSurface/></AppWindow></div>
        </div>
      </div>
    </section>
  );
}
const FOOT = {
  Product: ["Features", "Pricing"],
  Resources: ["Trust", "Documentation", "Support", "FAQ"],
  Company: ["About", "Mission", "Legal", "Contact"],
};
function Footer() {
  return (
    <footer style={{ padding: "0 40px" }}>
      <div style={{ maxWidth: 1340, margin: "0 auto", borderTop: `1px solid ${T.hairStrong}`, padding: "56px 0 28px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 48 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.primary }}/>
            <Brand/>
          </div>
          <p style={{ margin: "20px 0 0", maxWidth: "36ch", font: `400 13px/1.55 ${T.sans}`, color: T.mute }}>
            An operating system for modern legal departments.
          </p>
        </div>
        {Object.entries(FOOT).map(([col, links]) => (
          <div key={col}>
            <Mono s={11} ls=".16em" c={T.caption} style={{ display: "block", marginBottom: 18 }}>{col}</Mono>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {links.map((l) => <li key={l}><span style={{ font: `400 14px/1 ${T.sans}`, color: T.ink2 }}>{l}</span></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 40, display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `1px solid ${T.hair}`, paddingTop: 20 }}>
        <Mono s={11} ls=".14em" c={T.caption} style={{ display: "inline-flex", gap: 6 }}>© 2026 <Brand s={11} style={{ fontWeight: 500 }}/></Mono>
        <Mono s={11} ls=".06em" c={T.caption} style={{ textTransform: "none" }}>v0.1.0</Mono>
      </div>
      </div>
    </footer>
  );
}

/* ── page ────────────────────────────────────────────────────────────── */
function Page() {
  return (
    <div className="los" style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column" }}>
      <LosStyle/>
      <Topbar/>
      <main>
        <Hero/>
        <PlatformSection/>
        <ControlSection/>
      </main>
      <Footer/>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<Page/>);
