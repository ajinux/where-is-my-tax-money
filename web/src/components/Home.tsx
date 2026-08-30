import type { Summary } from "../lib/model";
import { formatCroreShort } from "../lib/format";
import { LogoMarkLarge } from "./Logo";

const PRIMARY: React.CSSProperties = {
  width: "100%",
  border: 0,
  borderRadius: 999,
  background: "var(--color-accent)",
  color: "var(--color-bg)",
  font: "inherit",
  fontSize: 17,
  fontWeight: 700,
  padding: 18,
  cursor: "pointer",
  minHeight: 56,
};

export function Home({ summary, onStart }: { summary: Summary; onStart: () => void }) {
  // The strip is drawn from the newest year's real spending, inlined into the
  // prerendered HTML — so the landing page is complete before any fetch.
  const widest = summary.strip.reduce((m, b) => Math.max(m, b.amountRupees), 0);

  // Everything below the hero is the union's own spending; devolution is deducted
  // before any of it and must not be summed with it.
  const spending = summary.strip.filter((block) => block.id !== "devolution");
  const unionTotal = spending.reduce((total, block) => total + block.amountRupees, 0);

  return (
    <>
    <div
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(330px, 100%), 1fr))",
        gap: "0 clamp(0px, 5vw, 72px)",
        alignItems: "center",
        width: "100%",
        maxWidth: 1060,
        padding: "0 clamp(22px, 4vw, 48px) 34px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignSelf: "stretch" }}>
        <div style={{ paddingTop: "clamp(40px, 8vh, 96px)", maxWidth: 520 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(44px, 5.2vw, 68px)",
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              textWrap: "pretty",
            }}
          >
            They spent it.
            <br />
            You never saw
            <br />
            the bill.
          </h1>
          <p style={{ margin: "20px 0 0", fontSize: "clamp(16px, 1.3vw, 18px)", lineHeight: 1.5, maxWidth: 380, color: "var(--color-neutral-800)", textWrap: "pretty" }}>
            Every rupee you paid as tax went somewhere specific. Nobody has ever told you where.
          </p>
          <p style={{ margin: "14px 0 0", fontSize: "clamp(16px, 1.3vw, 18px)", lineHeight: 1.5, maxWidth: 380, color: "var(--color-neutral-800)", textWrap: "pretty" }}>
            Enter what you paid and we will show you the breakdown, using the government’s own
            budget numbers.
          </p>
        </div>

        <div style={{ marginTop: "auto", paddingTop: 40, maxWidth: 460 }}>
          <button type="button" onClick={onStart} className="btn-cta" style={PRIMARY}>
            Show me where it went
          </button>
          <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 14 }}>
            <LogoMarkLarge />
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: "var(--color-neutral-800)" }}>
              Ministry of Finance figures, {summary.yearRange}.
            </p>
          </div>
        </div>
      </div>

      <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 7, padding: "34px 0" }}>
        {summary.strip.map((block) => (
          <div key={block.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                display: "block",
                height: 26,
                borderRadius: 999,
                background: block.tone,
                width: `${(block.amountRupees / widest) * 100}%`,
                minWidth: 8,
              }}
            />
            <span style={{ fontSize: 12, color: "var(--color-neutral-700)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {block.label}
            </span>
          </div>
        ))}
        <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--color-neutral-700)" }}>
          Every rupee the government spends, to scale. Yours follows the same shape.
        </p>
      </div>
    </div>

    {/*
      Below the fold, and the only part of this page a search engine can read
      anything from.

      The hero is one <h1> of three-word lines and a button; the bars beside it
      are aria-hidden decoration. That was the entire crawlable content of the
      site, about 1.4 KB, while the dataset behind it carries eleven authored
      category descriptions, 102 line items and 136 cited government documents.
      This section is those descriptions, as text, with links to the pages that
      hold the rest. Nothing here is written by hand: the labels and blurbs are
      the dataset's own, so they cannot drift from the figures beside them.
    */}
    <section
      style={{
        width: "100%",
        maxWidth: 1060,
        marginInline: "auto",
        padding: "8px clamp(22px, 4vw, 48px) 56px",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "clamp(26px, 2.6vw, 34px)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
        Where the union budget actually goes
      </h2>
      <p style={{ margin: "12px 0 0", maxWidth: 620, fontSize: 15, lineHeight: 1.6, color: "var(--color-neutral-800)", textWrap: "pretty" }}>
        The Government of India spent {formatCroreShort(unionTotal)} in {summary.years[0].label},
        and sent a further {formatCroreShort(summary.strip[0].amountRupees)} to the states as
        their share of central taxes. Every rupee of it is sorted into these {spending.length}{" "}
        categories, each figure read from a published Ministry of Finance document.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(290px, 100%), 1fr))",
          gap: "22px 40px",
          marginTop: 28,
        }}
      >
        {summary.strip.map((block) => (
          <article key={block.id}>
            <h3 style={{ margin: 0, fontSize: 16, lineHeight: 1.3, display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ flex: "none", width: 10, height: 10, borderRadius: 999, background: block.tone, transform: "translateY(-1px)" }} />
              <a href={block.href} style={{ textDecoration: "none" }}>
                {block.label}
              </a>
            </h3>
            <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.5, color: "var(--color-neutral-700)", textWrap: "pretty" }}>
              <strong style={{ color: "var(--color-neutral-800)" }}>
                {formatCroreShort(block.amountRupees)}
              </strong>
              {block.desc ? `, ${block.desc}` : null}
            </p>
          </article>
        ))}
      </div>

      <h2 style={{ margin: "44px 0 0", fontSize: "clamp(26px, 2.6vw, 34px)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
        How your income tax is split
      </h2>
      <p style={{ margin: "12px 0 0", maxWidth: 620, fontSize: 15, lineHeight: 1.6, color: "var(--color-neutral-800)", textWrap: "pretty" }}>
        Your income tax is not one thing. There is the base tax, a 4% health and education cess
        added on top of it, and above ₹50 lakh of income a surcharge as well. Only the base part
        is shared with the states; cess and surcharge stay with the union entirely, and cess is
        locked by law to health and education schemes.
      </p>
      <p style={{ margin: "10px 0 0", maxWidth: 620, fontSize: 15, lineHeight: 1.6, color: "var(--color-neutral-800)" }}>
        <a href="/method/">How this is calculated, in full</a>
      </p>

      <h2 style={{ margin: "44px 0 0", fontSize: "clamp(26px, 2.6vw, 34px)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
        Browse the figures
      </h2>
      <ul style={{ margin: "12px 0 0", paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "var(--color-neutral-800)" }}>
        <li><a href="/where/">What the money paid for</a>, in {spending.length} categories</li>
        <li><a href="/ministry/">Which ministry spent it</a></li>
        <li><a href="/demand/">Every line in the budget</a>, one page each</li>
        <li><a href="/state/">What each state received</a></li>
        <li><a href="/year/">Year by year</a>, {summary.yearRange}</li>
        <li><a href="/sources/">Every document these figures come from</a></li>
      </ul>
    </section>
    </>
  );
}
