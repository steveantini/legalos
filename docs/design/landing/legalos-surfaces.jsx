/* ═══════════════════════════════════════════════════════════════════════
   legalOS — the four product surfaces, full-window, in the real Aperture
   register. Built to mirror the shipping components (impact band, department
   cards, structured-query result, run approval card).
   ═══════════════════════════════════════════════════════════════════════ */

/* shared scalar stat — matches components/metrics MetricStat */
function Stat({ label, value, suffix, hint }) {
  return (
    <div>
      <Mono s={10} ls=".14em" c={T.caption}>{label}</Mono>
      <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ font: `400 28px/1 ${T.sans}`, letterSpacing: "-.02em", color: T.ink, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        {suffix ? <span style={{ font: `500 13px/1 ${T.mono}`, color: T.caption }}>{suffix}</span> : null}
      </div>
      {hint ? <div style={{ marginTop: 6 }}><span style={{ font: `500 11px/1.4 ${T.sans}`, color: T.primary, fontVariantNumeric: "tabular-nums" }}>{hint}</span></div> : null}
    </div>
  );
}

/* ── 1 · WORKSPACE ───────────────────────────────────────────────────── */
function WorkspaceSurface() {
  const needs = [
    { type: "MPA", title: "Red Hat — Master Purchase Agreement v4", due: "Today · 10:30", tone: T.primary },
    { type: "DPA", title: "CGI Federal — DPA Amendment, EU Annex", due: "Fri · Jun 26", tone: T.caption },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 style={{ margin: 0, font: `400 30px/1.04 ${T.sans}`, letterSpacing: "-.03em", color: T.ink }}>
          Good afternoon, <span style={{ color: T.primary }}>Steven</span>.
        </h1>
        <p style={{ margin: 0, font: `400 13.5px/1.5 ${T.sans}`, color: T.mute, maxWidth: "52ch" }}>
          Welcome back to <strong style={{ fontWeight: 500, color: T.primary }}>legalOS</strong>, your team’s departments,
          knowledge, workflows, and integrations, all in one place.
        </p>
      </div>

      {/* impact band */}
      <div>
        <Mono s={10} ls=".14em" c={T.caption} style={{ marginLeft: 2 }}>YOUR IMPACT · THIS QUARTER</Mono>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", background: T.card,
          border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden",
          boxShadow: "0 1px 0 rgba(26,24,22,.02), 0 1px 3px rgba(26,24,22,.04), 0 8px 24px -8px rgba(26,24,22,.06)" }}>
          {[
            { label: "HOURS SAVED", value: "142", suffix: "hrs", hint: "+18 vs last quarter" },
            { label: "EST. COST SAVED", value: "$48.2K", hint: "vs. outside counsel" },
            { label: "AGENT RUNS", value: "1,204", hint: "97% with no edits" },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: "18px 22px", borderLeft: i ? `1px solid ${T.divider}` : "none" }}>
              <Stat {...s}/>
            </div>
          ))}
        </div>
      </div>

      {/* needs you */}
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: `1px solid ${T.hair}`, paddingBottom: 10, marginBottom: 4 }}>
          <span style={{ font: `500 14px/1 ${T.sans}`, letterSpacing: "-.01em", color: T.ink }}>Needs you</span>
          <span style={{ font: `500 12px/1 ${T.sans}`, color: T.primary }}>All matters →</span>
        </div>
        {needs.map((n, i) => (
          <div key={i} className="los-navrow" style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 14, alignItems: "center", padding: "12px 6px", borderRadius: 8, cursor: "pointer" }}>
            <span style={{ display: "inline-flex", justifyContent: "center", alignItems: "center", height: 22, borderRadius: 6, background: T.ink, color: T.primaryFg, font: `600 9.5px/1 ${T.mono}`, letterSpacing: ".04em" }}>{n.type}</span>
            <span style={{ font: `450 13.5px/1.25 ${T.sans}`, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
            <span style={{ font: `450 12px/1 ${T.sans}`, color: n.tone }}>{n.due}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
window.WorkspaceSurface = WorkspaceSurface;

/* ── 2 · DEPARTMENTS ─────────────────────────────────────────────────── */
function DeptCard({ name, desc, n }) {
  return (
    <div className="los-lift" style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 150,
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, cursor: "pointer",
      boxShadow: "0 1px 0 rgba(26,24,22,.02), 0 1px 3px rgba(26,24,22,.04), 0 8px 24px -8px rgba(26,24,22,.06)" }}>
      <h3 style={{ margin: 0, font: `500 17px/1.15 ${T.sans}`, letterSpacing: "-.018em", color: T.ink }}>{name}</h3>
      <p style={{ margin: 0, flex: 1, font: `400 12.5px/1.45 ${T.sans}`, color: T.mute }}>{desc}</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `1px solid ${T.divider}`, paddingTop: 11 }}>
        <span style={{ font: `500 11px/1 ${T.mono}`, color: T.caption, fontVariantNumeric: "tabular-nums" }}>{n} agents</span>
        <span style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: "50%", background: T.bg, color: T.ink, font: `400 12px/1 ${T.sans}` }}>→</span>
      </div>
    </div>
  );
}
function DepartmentsSurface() {
  const depts = [
    { name: "Commercial", desc: "MSAs, NDAs, order forms, and renewals.", n: 8 },
    { name: "Corporate", desc: "Entities, equity, board, and governance.", n: 5 },
    { name: "Privacy", desc: "DPAs, DSARs, and cross-border transfers.", n: 6 },
    { name: "Litigation", desc: "Holds, disputes, and outside counsel.", n: 4 },
    { name: "Intellectual Property", desc: "Trademarks, filings, and brand watch.", n: 3 },
    { name: "Employment", desc: "Offers, policies, and separations.", n: 4 },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 style={{ margin: 0, font: `500 22px/1.1 ${T.sans}`, letterSpacing: "-.02em", color: T.ink }}>Departments</h1>
        <p style={{ margin: 0, font: `400 13px/1.5 ${T.sans}`, color: T.mute, maxWidth: "56ch" }}>
          Your AI counsel, organized like the team you already run. Thirty agents across six practice areas.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        {depts.map((d) => <DeptCard key={d.name} {...d}/>)}
      </div>
    </div>
  );
}
window.DepartmentsSurface = DepartmentsSurface;

/* ── 3 · KNOWLEDGE (Structured Query active) ─────────────────────────── */
function KnowledgeSurface() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 style={{ margin: 0, font: `500 22px/1.1 ${T.sans}`, letterSpacing: "-.02em", color: T.ink }}>Knowledge</h1>
        <p style={{ margin: 0, font: `400 13px/1.5 ${T.sans}`, color: T.mute, maxWidth: "56ch" }}>
          Ask your own documents. Two tools: reasoned research, and exact answers you can check.
        </p>
      </div>

      {/* two tools */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ font: `500 13.5px/1 ${T.sans}`, color: T.ink }}>Research</span>
            <Mono s={9} ls=".1em" c={T.caption}>READS · REASONS</Mono>
          </div>
          <span style={{ font: `400 12px/1.45 ${T.sans}`, color: T.mute }}>Read-and-reason answers with citations. Non-deterministic.</span>
        </div>
        <div style={{ background: T.card, border: `1px solid ${T.primary}`, borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6,
          boxShadow: "0 8px 24px -10px rgba(59,86,128,.30)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ font: `500 13.5px/1 ${T.sans}`, color: T.ink }}>Structured Query</span>
            <Mono s={9} ls=".1em" c={T.primary}>EXACT · REPEATABLE</Mono>
          </div>
          <span style={{ font: `400 12px/1.45 ${T.sans}`, color: T.mute }}>Exact, repeatable counts over fields you set up. Deterministic.</span>
        </div>
      </div>

      {/* question */}
      <div style={{ background: T.paper2, border: `1px solid ${T.hair}`, borderRadius: 12, padding: "14px 16px" }}>
        <Mono s={10} ls=".08em" c={T.mute} style={{ textTransform: "uppercase" }}>QUESTION</Mono>
        <p style={{ margin: "4px 0 0", font: `400 15px/1.5 ${T.sans}`, color: T.ink }}>How many active NDAs expire in Q3?</p>
      </div>

      {/* exact answer */}
      <div style={{ background: T.paper2, border: `1px solid ${T.hair}`, borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ font: `400 34px/1 ${T.sans}`, letterSpacing: "-.02em", color: T.ink, fontVariantNumeric: "tabular-nums" }}>37</span>
          <span style={{ font: `400 14px/1 ${T.sans}`, color: T.mute }}>of 1,204 documents</span>
        </div>
        <p style={{ margin: "12px 0 0", font: `400 12.5px/1.5 ${T.sans}`, color: T.caption }}>
          <span style={{ color: T.mute }}>Interpreted as:</span> NDAs where status is active and the expiry date falls within Jul 1 to Sep 30, 2026.
        </p>
      </div>

      {/* one matching document, with citation */}
      <div>
        <Mono s={10} ls=".08em" c={T.mute}>MATCHING DOCUMENTS</Mono>
        <div style={{ marginTop: 8, background: T.paper2, border: `1px solid ${T.hair}`, borderRadius: 10, padding: "12px 14px" }}>
          <p style={{ margin: 0, font: `500 13px/1.3 ${T.sans}`, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Acme Corp — Mutual NDA (2024)</p>
          <div style={{ marginTop: 6, font: `400 12px/1.5 ${T.sans}` }}>
            <span style={{ color: T.mute }}>Expiry:</span> <span style={{ color: T.ink }}>Aug 14, 2026</span>
            <span style={{ display: "block", marginTop: 3, borderLeft: `2px solid ${T.hair}`, paddingLeft: 8, color: T.caption }}>
              “…shall remain in effect until August 14, 2026…” <span style={{ color: T.caption }}>(verified against the source)</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
window.KnowledgeSurface = KnowledgeSurface;

/* ── 4 · WORKFLOWS (a paused run, human in command) ──────────────────── */
function RunStep({ kind, label, title, meta, last }) {
  const isApproval = kind === "approval";
  const dot = isApproval ? T.primary : kind === "done" ? T.ink2 : T.hairStrong;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span style={{ width: 13, height: 13, borderRadius: "50%", flexShrink: 0, marginTop: 3,
          background: kind === "pending" ? T.card : dot, border: `1.5px solid ${dot}`,
          boxShadow: isApproval ? `0 0 0 4px ${T.citeBg}` : "none", display: "grid", placeItems: "center" }}>
          {kind === "done" ? <span style={{ color: T.card, font: `700 8px/1 ${T.sans}` }}>✓</span> : null}
        </span>
        {!last ? <span style={{ flex: 1, width: 1.5, background: T.hair, marginTop: 3, minHeight: 18 }}/> : null}
      </div>
      {isApproval ? (
        <div style={{ marginBottom: 14, borderRadius: 10, overflow: "hidden", border: `1px solid ${T.citeBorder}`, background: T.citeBg }}>
          <div style={{ display: "flex", gap: 11, padding: "13px 15px" }}>
            <span style={{ width: 16, height: 16, marginTop: 1, flexShrink: 0, borderRadius: "50%", border: `1.5px solid ${T.primary}`, display: "grid", placeItems: "center", color: T.primary, font: `600 9px/1 ${T.sans}` }}>?</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Mono s={9} ls=".1em" c={T.primary}>{label}</Mono>
              <p style={{ margin: "7px 0 0", font: `450 13px/1.5 ${T.sans}`, color: T.ink }}>{title}</p>
              <p style={{ margin: "8px 0 0", borderLeft: `2px solid ${T.citeBorder}`, paddingLeft: 11, font: `400 13px/1.5 ${T.sans}`, color: T.ink2 }}>{meta}</p>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button style={{ font: `500 12.5px/1 ${T.sans}`, color: T.primaryFg, background: T.ink, borderRadius: 8, padding: "9px 16px" }}>Approve</button>
                <button style={{ font: `500 12.5px/1 ${T.sans}`, color: T.ink, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 16px" }}>Deny</button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ paddingBottom: last ? 0 : 14, display: "flex", flexDirection: "column", gap: 5 }}>
          <Mono s={9} ls=".1em" c={T.caption}>{label}</Mono>
          <span style={{ font: `450 13.5px/1.35 ${T.sans}`, color: T.ink }}>{title}</span>
          <Mono s={9.5} ls=".06em" c={T.caption} style={{ textTransform: "none", letterSpacing: ".01em" }}>{meta}</Mono>
        </div>
      )}
    </div>
  );
}
function WorkflowsSurface() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ margin: 0, font: `500 22px/1.1 ${T.sans}`, letterSpacing: "-.02em", color: T.ink }}>Renewal sweep</h1>
          <p style={{ margin: 0, font: `400 13px/1.5 ${T.sans}`, color: T.mute, maxWidth: "48ch" }}>
            A multi-step run that works on its own, and pauses for your call before anything leaves the building.
          </p>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0, font: `500 10px/1 ${T.mono}`, letterSpacing: ".1em", color: T.primary,
          border: `1px solid ${T.citeBorder}`, background: T.citeBg, borderRadius: 99, padding: "6px 11px" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.primary }}/> PAUSED
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 28, alignItems: "start", marginTop: 2 }}>
        <div>
          <RunStep kind="done" label="STEP 1 · AGENT" title="Extract renewal terms from 142 contracts" meta="Done · 142 of 142 read"/>
          <RunStep kind="approval" label="PAUSED · FOR YOUR APPROVAL"
            title="This run is paused at a human checkpoint. Approve to continue, or deny to stop it here."
            meta="Three contracts auto-renew within 30 days. Proceed before they lock?"/>
          <RunStep kind="pending" label="STEP 3 · ACTION" title="Schedule reminders and notify matter owners" meta="Queued · waiting on approval" last/>
        </div>
        <div style={{ background: T.paper2, border: `1px solid ${T.hair}`, borderRadius: 12, padding: "16px 18px" }}>
          <Mono s={10} ls=".14em" c={T.caption}>RUN DETAILS</Mono>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 13 }}>
            {[
              ["TRIGGER", "Manual · Steven A."],
              ["SCOPE", "Commercial · 142 contracts"],
              ["AUTONOMY", "Supervised"],
              ["STARTED", "Today · 09:58"],
              ["STEP", "2 of 3"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Mono s={9} ls=".1em" c={T.caption}>{k}</Mono>
                <span style={{ font: `450 13px/1.3 ${T.sans}`, color: T.ink }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, paddingTop: 13, borderTop: `1px solid ${T.hair}` }}>
            <Mono s={9} ls=".08em" c={T.caption} style={{ textTransform: "none", letterSpacing: ".01em", lineHeight: 1.5 }}>
              Every write pauses for approval, in every autonomy mode.
            </Mono>
          </div>
        </div>
      </div>
    </div>
  );
}
window.WorkflowsSurface = WorkflowsSurface;

/* ── 5 · ADMIN / CONTROL (the backend) ───────────────────────────────── */
function AdminCard({ tag, title, body }) {
  return (
    <div className="los-lift" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, cursor: "pointer",
      display: "flex", flexDirection: "column", gap: 9,
      boxShadow: "0 1px 0 rgba(26,24,22,.02), 0 1px 3px rgba(26,24,22,.04), 0 8px 24px -8px rgba(26,24,22,.06)" }}>
      <Mono s={9.5} ls=".14em" c={T.primary}>{tag}</Mono>
      <h3 style={{ margin: 0, font: `500 16px/1.15 ${T.sans}`, letterSpacing: "-.015em", color: T.ink }}>{title}</h3>
      <p style={{ margin: 0, font: `400 12.5px/1.5 ${T.sans}`, color: T.mute }}>{body}</p>
    </div>
  );
}
function AdminSurface() {
  const audit = [
    ["Role changed", "Priya Nair promoted to Admin", "2h ago"],
    ["Connection set read-only", "NetDocuments, org-wide", "Yesterday"],
    ["Member deactivated", "Contractor offboarded, access revoked", "Jun 24"],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 style={{ margin: 0, font: `500 22px/1.1 ${T.sans}`, letterSpacing: "-.02em", color: T.ink }}>Admin</h1>
        <p style={{ margin: 0, font: `400 13px/1.5 ${T.sans}`, color: T.mute, maxWidth: "60ch" }}>
          Govern access and measure adoption from one control center. Real, measured usage. Least-privilege by default.
        </p>
      </div>

      {/* measured insights */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", background: T.card,
        border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden",
        boxShadow: "0 1px 0 rgba(26,24,22,.02), 0 1px 3px rgba(26,24,22,.04), 0 8px 24px -8px rgba(26,24,22,.06)" }}>
        {[
          { label: "ADOPTION", value: "86%", hint: "17 of 20 active" },
          { label: "AGENT RUNS", value: "1,204", hint: "last 30 days" },
          { label: "HOURS GIVEN BACK", value: "142", suffix: "hrs", hint: "measured" },
          { label: "MONTHLY SPEND", value: "$2,140", hint: "run-rate" },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: "18px 20px", borderLeft: i ? `1px solid ${T.divider}` : "none" }}><Stat {...s}/></div>
        ))}
      </div>

      {/* govern + audit */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.15fr", gap: 14, alignItems: "start" }}>
        <AdminCard tag="GOVERN · PEOPLE" title="People &amp; roles" body="18 people across 6 roles. Invitations, least-privilege rules, and reversible deactivation."/>
        <AdminCard tag="GOVERN · POLICY" title="Policy &amp; access" body="Set the org default model, read-only vs read-and-write per connection, and the research document cap."/>
        <div style={{ background: T.paper2, border: `1px solid ${T.hair}`, borderRadius: 14, padding: 18 }}>
          <Mono s={10} ls=".14em" c={T.caption}>AUDIT LOG</Mono>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            {audit.map(([t, d, when]) => (
              <div key={t} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.primary, marginTop: 6, flexShrink: 0 }}/>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ font: `500 12.5px/1.3 ${T.sans}`, color: T.ink }}>{t}</span>
                    <Mono s={9} ls=".04em" c={T.caption} style={{ flexShrink: 0, textTransform: "none" }}>{when}</Mono>
                  </div>
                  <span style={{ font: `400 12px/1.4 ${T.sans}`, color: T.mute }}>{d}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
window.AdminSurface = AdminSurface;
