import { useEffect, useRef, useState } from "react";
import { RELEASE, SITE, SPECS, TOUR, RUST_TEST, installerMB, mb, type Asset } from "./content";
import { Mark, GitHub, ArrowRight, Download, Copy, Check } from "./components/Icons";

type OS = "windows" | "mac" | "linux" | null;

function detectOS(): OS {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/i.test(ua) && !/iPhone|iPad/i.test(ua)) return "mac";
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return null;
}

/** Primary download for the visitor's OS. Server render links to #download; the client swaps in the real file. */
function useDownload() {
  const [os, setOS] = useState<OS>(null);
  useEffect(() => setOS(detectOS()), []);
  const a = RELEASE.assets;
  if (os === "windows" && a.windows) return { href: a.windows.url, label: "Download for Windows", size: mb(a.windows.size) };
  if (os === "mac" && a.macArm) return { href: "#download", label: "Download for macOS", size: null };
  if (os === "linux" && a.appimage) return { href: "#download", label: "Download for Linux", size: null };
  return { href: "#download", label: "Download", size: null };
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className="nav" data-scrolled={scrolled}>
      <div className="nav-inner">
        <a className="brand" href="#top" aria-label="Turbo Reader, back to top">
          <Mark /> <span>Turbo Reader</span>
        </a>
        <nav aria-label="Sections" className="nav-links">
          <a href="#tour">Tour</a>
          <a href="#agents">Agents</a>
          <a href="#performance">Performance</a>
          <a href={SITE.changelog}>Changelog</a>
        </nav>
        <a className="icon-link" href={SITE.repo} aria-label="Turbo Reader on GitHub">
          <GitHub />
        </a>
        <a className="btn btn-solid btn-sm" href="#download">
          Download
        </a>
      </div>
    </header>
  );
}

function Hero() {
  const dl = useDownload();
  const budget = Number(installerMB) / 5;
  return (
    <section className="hero wrap" id="top" aria-labelledby="hero-title">
      <div className="hero-copy">
        <a className="release-pill" href={RELEASE.page}>
          <span className="dot" aria-hidden="true" />v{RELEASE.version} · Windows, macOS, Linux · MIT
        </a>
        <h1 id="hero-title" className="hero-title">
          <span className="mega" aria-hidden="true">
            {installerMB}
            <small>MB</small>
          </span>
          <span className="sr-only">Turbo Reader is a {installerMB} MB RSS reader. </span>
          <span className="hero-line">An RSS reader that is actually fast and actually small.</span>
        </h1>
        <p className="hero-sub">
          Opens in under half a second. Holds 20,000 articles in a 14 MB core process. A Rust core and a React shell,
          built with Tauri 2.
        </p>
        <div className="cta-row">
          <a className="btn btn-solid" href={dl.href}>
            <Download />
            {dl.label}
            {dl.size && <span className="btn-meta">{dl.size} MB</span>}
          </a>
          <a className="btn btn-ghost" href={SITE.repo}>
            <GitHub /> View on GitHub
          </a>
        </div>
      </div>

      <div className="spec-card">
        <dl className="specs">
          <div className="spec spec-budget">
            <dt>Windows installer</dt>
            <dd>
              <span className="mono">{installerMB}</span> MB
            </dd>
            <div className="meter" role="img" aria-label={`${installerMB} MB of a 5 MB size budget`}>
              <span style={{ transform: `scaleX(${budget})` }} />
            </div>
            <p className="meter-note">
              Kept under a 5 MB budget. Anything new has to make room first.
            </p>
          </div>
          {SPECS.map((s) => (
            <div className="spec" key={s.label}>
              <dt>{s.label}</dt>
              <dd>
                <span className="mono">{s.value}</span> {s.unit}
              </dd>
            </div>
          ))}
        </dl>
        <p className="source">
          Measured on one Windows machine. Installer size from the v{RELEASE.version} release.{" "}
          <a href={SITE.perf}>Method</a>
        </p>
      </div>
    </section>
  );
}

function Shot({ name, alt, eager, sizes = "(min-width: 1240px) 1200px, 100vw" }: { name: string; alt: string; eager?: boolean; sizes?: string }) {
  return (
    <img
      src={`/screenshots/${name}.webp`}
      srcSet={`/screenshots/${name}-1000.webp 1000w, /screenshots/${name}.webp 2000w`}
      sizes={sizes}
      width={2000}
      height={1300}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding={eager ? "sync" : "async"}
    />
  );
}

function Stage() {
  return (
    <div className="stage wrap" aria-hidden="false">
      <figure className="stage-shot">
        <Shot
          name="home"
          eager
          alt="Turbo Reader's home page in the dark theme: counts for today, this week and this month, a search box, and article cards grouped by category"
        />
      </figure>
    </div>
  );
}

function Principles() {
  return (
    <section className="wrap principles" aria-label="What makes it different">
      <div className="rise">
        <h2>A home page, not a backlog.</h2>
        <p>
          Most readers open on everything you have not read. Turbo Reader opens on what happened since you last looked:
          today, this week, this month, and your pinned feeds first.
        </p>
      </div>
      <div className="rise">
        <h2>Ranking with no account.</h2>
        <p>
          Freshness, what you read, the feeds you open, the ones you pinned, and two keyword lists you write yourself.
          It runs locally, and every card says why it is there.
        </p>
      </div>
      <div className="rise">
        <h2>Five layouts, per category.</h2>
        <p>
          Cards, mosaic, magazine, compact or headlines, chosen per folder. Or leave it on auto, which looks at whether
          the feeds carry images.
        </p>
      </div>
    </section>
  );
}

function Tour() {
  const [active, setActive] = useState(TOUR[0].id);
  const refs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.id!);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <section className="tour wrap" id="tour" aria-labelledby="tour-title">
      <div className="section-head rise">
        <h2 id="tour-title">Everything in one small window.</h2>
        <p>The real app, on Windows. Scroll through it.</p>
      </div>
      <div className="tour-grid">
        <div className="tour-steps">
          {TOUR.map((t, i) => (
            <article
              key={t.id}
              data-id={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              className="tour-step"
              data-active={active === t.id}
            >
              <figure className="tour-inline">
                <Shot name={t.shot} alt={t.alt} sizes="100vw" />
              </figure>
              <h3>{t.title}</h3>
              <p>{t.body}</p>
              <ul>
                {t.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div className="tour-viewer" aria-hidden="true">
          <div className="tour-frame">
            {TOUR.map((t) => (
              <img
                key={t.id}
                src={`/screenshots/${t.shot}.webp`}
                srcSet={`/screenshots/${t.shot}-1000.webp 1000w, /screenshots/${t.shot}.webp 2000w`}
                sizes="(min-width: 1240px) 760px, 62vw"
                width={2000}
                height={1300}
                alt=""
                loading="lazy"
                decoding="async"
                data-on={active === t.id}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Sanitiser() {
  return (
    <section className="wrap sanitiser" aria-labelledby="san-title">
      <div className="san-copy rise">
        <h2 id="san-title">It cannot be taken down by an article.</h2>
        <p>
          Feed HTML is fetched, parsed and run through an allowlist sanitiser in Rust before the webview ever sees it.
          Browser engines kill the renderer outright on some malformed markup, and no <code>try/catch</code> can catch
          that. The only real defence is never handing it over.
        </p>
      </div>
      <pre className="code rise" aria-label="A Rust test from the Turbo Reader source">
        <code>{RUST_TEST}</code>
      </pre>
    </section>
  );
}

function CopyLine({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const t = useRef<number>(undefined);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.clearTimeout(t.current);
      t.current = window.setTimeout(() => setDone(false), 1600);
    } catch {
      /* clipboard refused; the text stays selectable */
    }
  };
  return (
    <div className="copy-line">
      <code>{text}</code>
      <button type="button" className="copy-btn" onClick={copy} aria-label={done ? "Copied" : "Copy command"} data-done={done}>
        <span className="copy-icons" aria-hidden="true">
          <Copy />
          <Check />
        </span>
      </button>
    </div>
  );
}

function Agents() {
  return (
    <section className="wrap agents" id="agents" aria-labelledby="agents-title">
      <div className="section-head rise">
        <h2 id="agents-title">Your feeds, for your agents.</h2>
        <p>
          Turbo Reader can be a news source for Claude Code, Codex, Claude Desktop, Cursor and any other agent that
          speaks the Model Context Protocol. Ask “what's new in my feeds today?” and the agent reads your own library.
        </p>
      </div>
      <div className="agents-grid">
        <ul className="facts rise">
          <li>
            <b>Two ways in.</b> A local server inside the app with API keys, or <code>turbo-reader --mcp</code>, which an
            agent starts itself with the app closed.
          </li>
          <li>
            <b>Off by default</b>, and local to this computer unless you allow your network.
          </li>
          <li>
            <b>Read-only unless you say otherwise</b>, per key.
          </li>
          <li>
            <b>14 tools:</b> latest articles, full-text search, full articles as Markdown, digests, feeds and folders, and
            with write access, subscribe, star and mark read.
          </li>
          <li>
            <b>A skill to go with it.</b> Install the Turbo Reader <code>SKILL.md</code> for Claude Code or Codex in one
            click.
          </li>
        </ul>
        <div className="agent-setup rise">
          <p className="label">Claude Code, over stdio</p>
          <CopyLine text={`claude mcp add turbo-reader -- "/usr/bin/turbo-reader" --mcp`} />
          <p className="label">Codex, in ~/.codex/config.toml</p>
          <pre className="code code-sm">
            <code>{`[mcp_servers.turbo-reader]
command = "C:\\\\Users\\\\you\\\\AppData\\\\Local\\\\Turbo Reader\\\\turbo-reader.exe"
args = ["--mcp"]`}</code>
          </pre>
          <p className="hint">
            Settings › AI agents shows the exact path for your machine, ready to copy.{" "}
            <a href={SITE.mcpDocs}>Full agent guide</a>
          </p>
        </div>
      </div>
    </section>
  );
}

function Performance() {
  // To scale: the Rust core against the full footprint with the system webview (README).
  const core = 14;
  const total = 270;
  return (
    <section className="wrap perf" id="performance" aria-labelledby="perf-title">
      <div className="section-head rise">
        <h2 id="perf-title">Where the memory goes.</h2>
        <p>
          With 500 feeds and 20,000 articles, the Rust process that holds your library, the database and the fetcher
          uses about 14 MB, and that barely moves as the library grows. Most of the rest is the system webview that
          draws the window.
        </p>
      </div>
      <figure className="mem rise">
        <div className="mem-bar" role="img" aria-label="14 MB Rust core out of about 270 MB in total with the system webview">
          <span className="mem-core" style={{ width: `${(core / total) * 100}%` }} />
          <span className="mem-web" />
        </div>
        <figcaption className="mem-legend">
          <span>
            <i className="sw sw-core" /> Rust core <b className="mono">14 MB</b>
          </span>
          <span>
            <i className="sw sw-web" /> System webview <b className="mono">~256 MB</b>
          </span>
          <span className="mem-total">
            Total <b className="mono">~270 MB</b>
          </span>
        </figcaption>
      </figure>
      <div className="perf-notes rise">
        <p>
          Tauri uses the webview the operating system already ships instead of bundling a second copy of a browser.
          Articles stay in SQLite with paged queries and an FTS5 index, so memory does not climb with the size of your
          library.
        </p>
        <p>
          No account, no analytics, no telemetry. It talks to the feeds you add, to GitHub once at launch to check for a
          release (you can turn that off), and to AI agents only if you switch the agent server on.{" "}
          <a href={SITE.privacy}>Privacy policy</a>
        </p>
      </div>
    </section>
  );
}

function DlLink({ a, label }: { a?: Asset; label: string }) {
  if (!a) return null;
  return (
    <a className="dl" href={a.url}>
      <span className="dl-label">{label}</span>
      <span className="dl-meta mono">{mb(a.size)} MB</span>
      <ArrowRight />
    </a>
  );
}

function Downloads() {
  const a = RELEASE.assets;
  const date = new Date(RELEASE.date + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <section className="wrap downloads" id="download" aria-labelledby="dl-title">
      <div className="section-head rise">
        <h2 id="dl-title">Download Turbo Reader.</h2>
        <p>
          Version {RELEASE.version}, released {date}. Free and open source under the MIT licence.{" "}
          <a href={RELEASE.page}>Release notes</a>
        </p>
      </div>
      <div className="dl-grid">
        <div className="dl-col rise">
          <h3>Windows</h3>
          <DlLink a={a.windows} label="Installer (.exe)" />
          <DlLink a={a.windowsMsi} label="Installer (.msi)" />
          <DlLink a={a.windowsPortable} label="Portable (.zip)" />
          <p className="dl-note">
            Not code-signed yet. If SmartScreen warns, click More info, then Run anyway.
          </p>
        </div>
        <div className="dl-col rise">
          <h3>macOS</h3>
          <DlLink a={a.macArm} label="Apple silicon (.dmg)" />
          <DlLink a={a.macIntel} label="Intel (.dmg)" />
          <p className="dl-note">
            Not notarised yet. Right-click the app and choose Open, or run{" "}
            <code>xattr -cr "/Applications/Turbo Reader.app"</code>.
          </p>
        </div>
        <div className="dl-col rise">
          <h3>Linux</h3>
          <DlLink a={a.appimage} label="AppImage" />
          <DlLink a={a.deb} label="Debian, Ubuntu (.deb)" />
          <DlLink a={a.rpm} label="Fedora (.rpm)" />
          <DlLink a={a.flatpak} label="Flatpak" />
        </div>
      </div>
      {a.checksums && (
        <p className="checksums">
          Check what you installed against the SHA-256 of every file in <a href={a.checksums.url}>SHA256SUMS.txt</a>.
        </p>
      )}
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <p className="footer-statement">
          <Mark /> Turbo Reader
        </p>
        <p className="footer-by">
          By <a href="https://github.com/t21dev">t21 dev</a> and <a href="https://github.com/TriptoAfsin">TriptoAfsin</a>.
          Thanks to <a href="https://github.com/yang991178/fluent-reader">Fluent Reader</a>, whose feature design informed
          parts of this one.
        </p>
        <nav className="footer-links" aria-label="Footer">
          <a href={SITE.repo}>GitHub</a>
          <a href={SITE.changelog}>Changelog</a>
          <a href={SITE.privacy}>Privacy</a>
          <a href={SITE.license}>MIT licence</a>
          <a href="https://t21.dev">t21.dev</a>
        </nav>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <Stage />
        <Principles />
        <Tour />
        <Sanitiser />
        <Agents />
        <Performance />
        <Downloads />
      </main>
      <Footer />
    </>
  );
}
