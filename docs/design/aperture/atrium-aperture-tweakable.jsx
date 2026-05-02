/* Tweakable Aperture — self-contained version of the final Aperture landing.
   Wraps everything that's editable in props sourced from useTweaks().
   Reuses the hybridLandingCss + Aperture (.va) styles from atrium-hybrid-departments.jsx. */

function ApertureTweakable({ tweaks, setTweak }) {
  const departments = tweaks.departments || [];

  return (
    <div className="ab hybl va" data-screen-label="Atrium · Aperture (tweakable)">
      <style>{window.hybridLandingCss}</style>
      <nav className="hybl-nav">
        <div className="brand">{tweaks.brand}</div>

        <div className="group">
          <a className="active"><span><span className="glyph">⌂</span>Workspace</span><span className="ct">⌘1</span></a>
        </div>

        <div className="group">
          <div className="lbl">Departments</div>
          {departments.map((d, i) =>
          <a key={i}>
              <span><span className="glyph"></span>{d.name}</span>
              <span className="ct">{d.count}</span>
            </a>
          )}
        </div>

        <div className="group">
          <a><span><span className="glyph">∿</span>Knowledge</span><span className="ct"></span></a>
          <a><span><span className="glyph">▤</span>Matters / Deals</span><span className="ct">{departments.reduce((s, d) => s + (Number(d.count) || 0), 0)}</span></a>
          <a><span><span className="glyph">⊟</span>Inbox</span><span className="ct">{tweaks.inboxCount}</span></a>
          <a><span><span className="glyph">❒</span>Resources</span><span className="ct"></span></a>
        </div>

        <div className="me">
          <div className="av">{tweaks.userInitials}</div>
          <div>
            <div className="nm">{tweaks.userName}</div>
            <div className="ro">{tweaks.userRole}</div>
          </div>
        </div>
      </nav>

      <div className="hybl-main">
        <header className="hybl-top">
          <div className="crumb">workspace / <b>departments</b></div>
          <div className="right">
            <span className="live">{tweaks.agentsRunning}</span>
            <span>{tweaks.dateLine}</span>
          </div>
        </header>

        <div className="hybl-body">
          <div className="hybl-greet">
            <div>
              <div className="lbl">Workspace</div>
              <h1
                dangerouslySetInnerHTML={{
                  __html: (tweaks.greeting || "").
                  replace(/</g, "&lt;").
                  replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
                }} />
              
              <p className="sub">{tweaks.subline}</p>
            </div>
            <div className="stats">
              <div className="stat"><div className="k"></div><div className="v">{tweaks.statOpen}</div></div>
              <div className="stat"><div className="k"></div><div className="v">{tweaks.statSLA}</div></div>
              <div className="stat"><div className="k">Saved · MTD</div><div className="v">{tweaks.statSaved}</div></div>
            </div>
          </div>

          <div className="hybl-section">
            <h2>Departments</h2>
            <span className="more">customize layout →</span>
          </div>

          <div className="grid">
            {departments.map((d, i) =>
            <div key={i} className="card">
                <div className="name">{d.name}</div>
                <div className="desc">{d.desc}</div>
                <div className="foot">
                  <span>{d.count} reviews · {d.savedH}h saved</span>
                  <span className="arrow">→</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="hybl-foot">
          <span></span>
          <span></span>
          <div className="right">
            <span>privilege enforced</span>
            <span>build 26.04</span>
          </div>
        </footer>
      </div>
    </div>);

}

window.ApertureTweakable = ApertureTweakable;