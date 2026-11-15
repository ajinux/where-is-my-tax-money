import { useRef } from "react";

import type { Summary } from "../lib/model";
import { formatCroreShort } from "../lib/format";
import { AmountField } from "./AmountInput";
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

/** A share of the whole as the list prints it; the smallest is not rounded to zero. */
function formatShare(fraction: number): string {
  const percent = fraction * 100;
  return percent < 0.05 ? "under 0.1%" : `${percent.toFixed(1)}%`;
}

interface Props {
  summary: Summary;
  amountStr: string;
  amount: number;
  onAmount: (raw: string) => void;
  /** Straight to the result, with the year and surcharge left at their defaults. */
  onSubmit: () => void;
  /** The full input screen, for a reader who wants to set the year or surcharge. */
  onOptions: () => void;
}

export function Home({ summary, amountStr, amount, onAmount, onSubmit, onOptions }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // The strip is drawn from the newest year's real spending, inlined into the
  // prerendered HTML — so the landing page is complete before any fetch.
  const widest = summary.strip.reduce((m, b) => Math.max(m, b.amountRupees), 0);

  // Everything below the hero is the union's own spending; devolution is deducted
  // before any of it and must not be summed with it.
  const spending = summary.strip.filter((block) => block.id !== "devolution");
  const unionTotal = spending.reduce((total, block) => total + block.amountRupees, 0);
  const largest = spending.reduce((m, b) => Math.max(m, b.amountRupees), 0);
  const devolution = summary.strip.find((block) => block.id === "devolution");
  const newest = summary.years[0];

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
        // Centred like the section below it. Without this the hero sat hard
        // left in the 1120px panel and the two left edges were 30px apart.
        marginInline: "auto",
        padding: "0 clamp(22px, 4vw, 48px) 34px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignSelf: "stretch" }}>
        <div style={{ paddingTop: "clamp(28px, 5vh, 64px)", maxWidth: 520 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-heading)",
              // Capped at 58px so "You never saw" fits the column on one line.
              // At 68px it wrapped, the heading ran to five lines, and on a
              // laptop that pushed the amount box below the fold.
              fontSize: "clamp(44px, 4.4vw, 58px)",
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

        <div style={{ marginTop: "auto", paddingTop: 32, maxWidth: 460 }}>
          <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--color-neutral-700)" }}>
            Income tax you paid last year
          </p>
          <AmountField
            amountStr={amountStr}
            amount={amount}
            onAmount={onAmount}
            onSubmit={onSubmit}
            inputRef={inputRef}
          />
          {/* Never disabled. A greyed-out button on a landing page reads as a
              broken one, so with nothing typed it points at the box instead. */}
          <button
            type="button"
            onClick={() => (amount > 0 ? onSubmit() : inputRef.current?.focus())}
            className="btn-cta"
            style={{ ...PRIMARY, marginTop: 16 }}
          >
            Show me where it went
          </button>
          <button
            type="button"
            onClick={onOptions}
            className="link-btn"
            style={{ display: "block", margin: "6px auto 0", background: "none", border: 0, padding: "10px 4px", minHeight: 44, cursor: "pointer", font: "inherit", fontSize: 13, color: "var(--color-accent-700)", textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            Pick another year or add a surcharge
          </button>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 14 }}>
            <LogoMarkLarge />
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: "var(--color-neutral-800)" }}>
              Ministry of Finance figures, {summary.yearRange}.
            </p>
          </div>
        </div>
      </div>

      {/* The bars take at most 56% of the row, so the longest label always has
          room beside the longest bar. They used to scale to the full width and
          clip the two labels that mattered most: "Sent to state gov…". */}
      <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 7, padding: "34px 0" }}>
        {summary.strip.map((block) => (
          <div key={block.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                flex: "none",
                display: "block",
                height: 26,
                borderRadius: 999,
                background: block.tone,
                width: `${(block.amountRupees / widest) * 56}%`,
                minWidth: 8,
              }}
            />
            <span style={{ fontSize: 12, lineHeight: 1.2, color: "var(--color-neutral-700)" }}>
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
    <section className="home-data">
      <p className="home-eyebrow">
        Union budget {newest.label} · {newest.tag}
      </p>
      <h2>Where the union budget actually goes</h2>

      {/* Two figures, kept apart on purpose. The states' share is deducted
          before the union spends anything, so it is not a twelfth category and
          is never added to the total beside it. */}
      <div className="home-totals">
        <div>
          <p className="home-figure">{formatCroreShort(unionTotal)}</p>
          <p className="home-figure-label">
            spent by the Government of India, sorted below into {spending.length} categories.
            Each figure is read from a published Ministry of Finance document.
          </p>
        </div>
        {devolution ? (
          <a href={devolution.href} className="home-totals-aside">
            <p className="home-figure">{formatCroreShort(devolution.amountRupees)}</p>
            <p className="home-figure-label">
              <strong>{devolution.label}</strong> before any of that. {devolution.desc}
            </p>
            <span className="home-more">What each state received →</span>
          </a>
        ) : null}
      </div>

      {/* The whole, to scale, in one line. No text on it: the list underneath
          gives every part its name and figure, and its swatches are the legend. */}
      <div className="home-whole" aria-hidden="true">
        {spending.map((block) => (
          <span
            key={block.id}
            title={`${block.label}: ${formatShare(block.amountRupees / unionTotal)}`}
            style={{ flexGrow: block.amountRupees, background: block.tone }}
          />
        ))}
      </div>

      <ol className="home-rows">
        {spending.map((block) => (
          <li key={block.id}>
            <a href={block.href}>
              <span className="home-row-name">
                <i style={{ background: block.tone }} />
                {block.label}
              </span>
              <span className="home-row-amount">
                {formatCroreShort(block.amountRupees)}
                <small>{formatShare(block.amountRupees / unionTotal)}</small>
              </span>
              <span className="home-row-bar" aria-hidden="true">
                <span style={{ width: `${(block.amountRupees / largest) * 100}%`, background: block.tone }} />
              </span>
              {block.desc ? <span className="home-row-desc">{block.desc}</span> : null}
            </a>
          </li>
        ))}
      </ol>
      <p className="home-note">
        Percentages are each category's share of union government spending in {newest.label}.
        Bars are drawn against the largest category.
      </p>

      <h2>How your income tax is split</h2>
      <p className="home-lede">
        Your income tax is not one thing. It is up to three, and they do not travel the same way.
      </p>
      <div className="home-cards">
        <div className="home-card">
          <p className="home-card-kicker">Base tax</p>
          <p className="home-card-title">Shared with the states</p>
          <p>The tax itself. This is the only part the states receive a share of.</p>
        </div>
        <div className="home-card">
          <p className="home-card-kicker">Cess · 4% on top</p>
          <p className="home-card-title">Locked to one purpose</p>
          <p>
            A health and education cess added to everyone's tax. It stays with the union and is
            locked by law to health and education schemes.
          </p>
        </div>
        <div className="home-card">
          <p className="home-card-kicker">Surcharge · income above ₹50 lakh</p>
          <p className="home-card-title">Kept by the union</p>
          <p>An extra percentage on higher incomes. None of it is shared with the states.</p>
        </div>
      </div>
      <p className="home-lede">
        <a href="/method/">How this is calculated, in full</a>
      </p>

      <h2>Browse the figures</h2>
      <div className="home-links">
        <a href="/where/">
          <strong>What the money paid for</strong>
          <span>{spending.length} categories of spending</span>
        </a>
        <a href="/ministry/">
          <strong>Which ministry spent it</strong>
          <span>{summary.counts.ministries} ministries</span>
        </a>
        <a href="/demand/">
          <strong>Every line in the budget</strong>
          <span>One page each, with what it funds</span>
        </a>
        <a href="/state/">
          <strong>What each state received</strong>
          <span>{summary.counts.states} states' share of central taxes</span>
        </a>
        <a href="/year/">
          <strong>Year by year</strong>
          <span>{summary.yearRange}</span>
        </a>
        <a href="/sources/">
          <strong>Where the figures come from</strong>
          <span>{summary.counts.documents} government documents, each linked</span>
        </a>
      </div>
    </section>
    </>
  );
}
