import { HEALTH_EDUCATION_CESS } from "../lib/allocate";

interface Props {
  yearLabel: string;
  yearTag: string;
  divisiblePoolPercent: number;
  awardLabel: string | null;
  /** In-app: return to the screen the reader came from. */
  onBack?: () => void;
  /**
   * Standalone page: a real link, because /method/ ships no JavaScript and a
   * <button onClick> there would render fine and do nothing.
   */
  backHref?: string;
  /** The standalone page owns the <h1>; in the app this is a section of one. */
  heading?: "h1" | "h2";
}

/** The statutory rate, read from the constant the calculation itself uses. */
const CESS_PERCENT = Math.round(HEALTH_EDUCATION_CESS * 100);

/**
 * Where the union's money comes from, with no sizes attached.
 *
 * The real proportions between these are not in this dataset, so every card is
 * drawn the same size on purpose: a reader cannot mistake the picture for a
 * share of anything. What it does show is the one thing that matters here,
 * which is that six streams arrive in a single pot.
 */
const SOURCES: { name: string; note: string; tone: string }[] = [
  { name: "Corporate tax", note: "What companies pay on their profits.", tone: "oklch(0.60 0.14 55)" },
  { name: "Income tax", note: "What individuals pay on what they earn. The one you file.", tone: "var(--color-accent-500)" },
  { name: "GST", note: "Charged on nearly everything you buy, collected by the seller.", tone: "oklch(0.60 0.13 250)" },
  { name: "Customs and excise", note: "Duties on imports, and on fuel.", tone: "oklch(0.62 0.13 170)" },
  { name: "Non-tax income", note: "Dividends from state-owned companies, the Reserve Bank's surplus, spectrum auctions, fees.", tone: "oklch(0.58 0.11 300)" },
  { name: "Borrowing", note: "It spends more than it takes in every year and borrows the difference.", tone: "oklch(0.62 0.13 130)" },
];

const STATE_TONE = "var(--color-accent-500)";
const UNION_TONE = "var(--color-accent-2-500)";

const label: React.CSSProperties = {
  margin: "32px 0 12px",
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--color-neutral-700)",
};

const body: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: 14,
  lineHeight: 1.55,
  color: "var(--color-neutral-800)",
  textWrap: "pretty",
};

const barLabel: React.CSSProperties = {
  margin: "0 0 5px",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--color-neutral-800)",
};

const segment: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 34,
  fontSize: 12,
  fontWeight: 700,
  color: "var(--color-bg)",
  whiteSpace: "nowrap",
  overflow: "hidden",
};

const dot = (tone: string): React.CSSProperties => ({
  flex: "none",
  width: 10,
  height: 10,
  borderRadius: 999,
  background: tone,
});

export function Method({
  yearLabel,
  yearTag,
  divisiblePoolPercent,
  awardLabel,
  onBack,
  backHref,
  heading = "h2",
}: Props) {
  const unionPercent = 100 - divisiblePoolPercent;
  const Heading = heading;
  const backStyle: React.CSSProperties = {
    alignSelf: "flex-start",
    marginTop: 22,
    background: "none",
    border: "1px solid var(--color-divider)",
    borderRadius: 999,
    padding: "10px 18px",
    font: "inherit",
    fontSize: 13,
    cursor: "pointer",
    color: "var(--color-text)",
    minHeight: 44,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: 620,
        marginInline: "auto",
        padding: "0 clamp(22px, 4vw, 48px) 40px",
      }}
    >
      {backHref ? (
        <a href={backHref} className="chip" style={backStyle}>
          ← Back
        </a>
      ) : (
        <button type="button" onClick={onBack} className="chip" style={backStyle}>
          ← Back
        </button>
      )}

      <Heading style={{ margin: "24px 0 0", fontFamily: "var(--font-heading)", fontSize: "clamp(30px, 2.8vw, 38px)", lineHeight: 1.08, letterSpacing: "-0.02em" }}>
        How your income tax is calculated and where it goes
      </Heading>

      <p style={{ margin: "14px 0 0", fontSize: 15, lineHeight: 1.55, color: "var(--color-neutral-800)", textWrap: "pretty" }}>
        Income tax is one of the largest single sources the union government has, and yours goes
        into one pot with everything else it collects and borrows. Here is what is in that pot,
        then how we get from your number to the breakdown.
      </p>

      {/* --- where it comes from ------------------------------------------- */}

      <p style={label}>Where the government's money comes from</p>

      {/* The pot is drawn as a container rather than a destination: the six
          sources are inside it, because containment is the actual relationship
          and needs no arrow to explain it. The cards are equal in size on
          purpose, which "not to scale" then says out loud. */}
      <div
        style={{
          background: "var(--color-surface)",
          borderRadius: "var(--radius-lg)",
          padding: "14px 14px 16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "2px 4px 11px" }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-800)" }}>
            One pot: the union budget
          </p>
          <p style={{ margin: 0, fontSize: 11, color: "var(--color-neutral-700)", whiteSpace: "nowrap" }}>
            Not to scale
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
          {SOURCES.map((source) => (
            <div
              key={source.name}
              style={{
                background: "var(--color-bg)",
                borderRadius: "var(--radius-md)",
                borderTop: `3px solid ${source.tone}`,
                padding: "11px 13px 13px",
              }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--color-neutral-900)" }}>
                {source.name}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 12, lineHeight: 1.4, color: "var(--color-neutral-700)", textWrap: "pretty" }}>
                {source.note}
              </p>
            </div>
          ))}
        </div>
      </div>

      <p style={body}>
        All of it is pooled before anything is spent. No rupee is tagged with who paid it, which is
        why this site shows you a proportion rather than tracing your actual money.
      </p>

      {/* --- how it gets distributed ---------------------------------------- */}

      <p style={label}>How your tax gets distributed</p>

      <p style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.55, color: "var(--color-neutral-800)", textWrap: "pretty" }}>
        Your income tax is not one thing. There is the base tax, a {CESS_PERCENT}% health and
        education cess added on top of it, and above ₹50 lakh of income a surcharge as well. The
        three are treated differently once they reach the pot.
      </p>

      <p style={barLabel}>Base tax</p>
      <div style={{ display: "flex", borderRadius: 999, overflow: "hidden" }}>
        <span style={{ ...segment, width: `${divisiblePoolPercent}%`, background: STATE_TONE }}>
          {divisiblePoolPercent}%
        </span>
        <span style={{ ...segment, width: `${unionPercent}%`, background: UNION_TONE }}>
          {unionPercent}%
        </span>
      </div>

      <p style={{ ...barLabel, marginTop: 14 }}>Cess, and surcharge if you pay one</p>
      <div style={{ display: "flex", borderRadius: 999, overflow: "hidden" }}>
        <span style={{ ...segment, width: "100%", background: UNION_TONE }}>100%</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", marginTop: 10, fontSize: 12, color: "var(--color-neutral-700)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={dot(STATE_TONE)} />
          Goes to your state government
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={dot(UNION_TONE)} />
          Stays with the union government
        </span>
      </div>

      <p style={body}>
        Only the base part is shared with states, at the {divisiblePoolPercent}% rate
        {awardLabel ? ` the ${awardLabel} sets` : " the Finance Commission sets"}. Cess is locked by
        law to health and education schemes, and neither cess nor surcharge is shared.
      </p>

      <p style={body}>
        What stays with the union is then divided across ministries and purposes in the proportions
        of the real {yearLabel} budget. That division is the list you see on your result.
      </p>

      {/* --- caveats --------------------------------------------------------- */}

      <p style={label}>What is not counted</p>
      <ul style={{ margin: 0, padding: "0 0 0 20px", fontSize: 14, lineHeight: 1.55, color: "var(--color-neutral-800)" }}>
        <li style={{ marginTop: 8, textWrap: "pretty" }}>
          <strong>GST.</strong> There is no single "GST you paid this year" figure to enter, because
          it sits inside the price of everything you buy rather than being filed as one number. It
          is also divided between the centre and the states by the GST Council, a different
          mechanism from the Finance Commission split shown above.
        </li>
        <li style={{ marginTop: 8, textWrap: "pretty" }}>
          <strong>State taxes.</strong> Property tax, stamp duty, state excise. Only money that
          reaches the union government is shown.
        </li>
      </ul>

      <p style={{ margin: "26px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--color-neutral-700)" }}>
        Figures: Ministry of Finance, {yearLabel} budget papers ({yearTag.toLowerCase()}).
      </p>
    </div>
  );
}
