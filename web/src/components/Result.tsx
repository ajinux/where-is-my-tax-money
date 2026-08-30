import type { Built } from "../lib/build";
import { formatInr } from "../lib/format";
import type { LensName } from "../lib/model";
import type { Rank } from "../lib/rank";
import { RowItem } from "./RowItem";

const LENSES: { id: LensName; label: string }[] = [
  { id: "purpose", label: "What it paid for" },
  { id: "administrative", label: "Who spent it" },
];

interface Props {
  built: Built;
  amount: number;
  yearLabel: string;
  lens: LensName;
  copiedRow: string | null;
  /** The row a shared link points at, by id. */
  focusId: string | null;
  rank: Rank | null;
  onLens: (lens: LensName) => void;
  onEdit: () => void;
  onOpen: (id: string) => void;
  onCopyRow: (id: string) => void;
  onShare: () => void;
}

export function Result({
  built, amount, yearLabel, lens, copiedRow, focusId, rank,
  onLens, onEdit, onOpen, onCopyRow, onShare,
}: Props) {
  return (
    <div className="result-grid" style={{ flex: 1, padding: "0 clamp(22px, 4vw, 48px) 40px" }}>
      <div className="result-summary">
        <div style={{ padding: "30px 0 0" }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>
            You paid in {yearLabel}
          </p>
          <h2 style={{ margin: "6px 0 0", fontFamily: "var(--font-heading)", fontSize: "clamp(40px, 4vw, 54px)", lineHeight: 1, letterSpacing: "-0.02em" }}>
            {formatInr(amount)}
          </h2>
          <button type="button" onClick={onEdit} className="link-btn" style={{ marginTop: 8, background: "none", border: 0, padding: "8px 0", minHeight: 44, cursor: "pointer", font: "inherit", fontSize: 13, color: "var(--color-accent-700)", textDecoration: "underline", textUnderlineOffset: 3 }}>
            Change amount, year or surcharge
          </button>
        </div>

        <div style={{ marginTop: 18, background: "var(--color-surface)", borderRadius: "var(--radius-lg)", padding: "18px 22px" }}>
          <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>
            Your tax is really three things
          </p>
          {built.parts.map((part) => (
            <div key={part.label} style={{ borderTop: "1px solid var(--color-divider)" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "8px 0" }}>
                <span style={{ fontSize: 13, lineHeight: 1.35, color: "var(--color-neutral-800)" }}>{part.label}</span>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 15, whiteSpace: "nowrap" }}>{part.amount}</span>
              </div>
              {part.opens ? (
                <button type="button" onClick={() => onOpen("cess")} className="link-btn" style={{ background: "none", border: 0, padding: "6px 0 10px", minHeight: 44, cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600, color: "var(--color-accent-700)" }}>
                  See what the cess pays for →
                </button>
              ) : null}
            </div>
          ))}
          <p style={{ margin: "12px 0 0", fontSize: 12, lineHeight: 1.5, color: "var(--color-neutral-700)", textWrap: "pretty" }}>
            Your state gets a share of the first amount only. Cess is charged on everyone and is
            locked to one purpose by law. Surcharge is charged only on higher incomes. Neither is
            shared with your state.
          </p>
        </div>

        {rank ? (
          <div style={{ marginTop: 20, background: rank.badge.tint, borderRadius: "var(--radius-lg)", padding: "20px 22px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <span style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, width: 88, height: 88, borderRadius: 999, background: rank.badge.tone, color: "var(--color-bg)", lineHeight: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.85 }}>Top</span>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 22, letterSpacing: "-0.02em" }}>{rank.topText}</span>
              </span>
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: rank.badge.ink, opacity: 0.75 }}>Your badge</p>
                <p style={{ margin: "4px 0 0", fontFamily: "var(--font-heading)", fontSize: 24, lineHeight: 1.1, letterSpacing: "-0.02em", color: rank.badge.ink }}>{rank.badge.name}</p>
                <p style={{ margin: "5px 0 0", fontSize: 13, lineHeight: 1.4, color: rank.badge.ink }}>
                  About 1 adult in {rank.oneIn} in India pays as much income tax as you.
                </p>
              </div>
            </div>
            <p style={{ margin: "14px 0 0", fontSize: 13, lineHeight: 1.5, color: rank.badge.ink, textWrap: "pretty" }}>
              {rank.badge.note}
            </p>
            <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: 1.45, color: rank.badge.ink, opacity: 0.7, textWrap: "pretty" }}>
              Compared against all adults in India, not just tax payers. Roughly two in a hundred pay any income tax at all.
            </p>
          </div>
        ) : null}
      </div>

      <div className="result-list">
        <div style={{ marginTop: 26, display: "flex", gap: 6, padding: 4, background: "var(--color-neutral-200)", borderRadius: 999 }}>
          {LENSES.map((option) => {
            const on = lens === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={on}
                onClick={() => onLens(option.id)}
                style={{ flex: 1, border: 0, borderRadius: 999, background: on ? "var(--color-bg)" : "transparent", color: on ? "var(--color-text)" : "var(--color-neutral-700)", font: "inherit", fontSize: 13, fontWeight: 600, padding: "12px 8px", minHeight: 44, cursor: "pointer" }}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <p style={{ margin: "16px 0 0", fontSize: 12, lineHeight: 1.45, color: "var(--color-neutral-700)" }}>
          Each colour is one category. Bars are sized against the biggest item; the percentage under
          each is its share of what you paid.
        </p>

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column" }}>
          {built.rows.map((row) => (
            <RowItem
              key={row.id}
              row={row}
              copied={copiedRow === row.id}
              focused={row.id === focusId}
              onCopy={() => onCopyRow(row.id)}
              onOpen={() => onOpen(row.id)}
            />
          ))}
          <div style={{ borderTop: "1px solid var(--color-divider)" }} />
        </div>
      </div>

      {/* Last in the DOM on purpose. On a phone the grid is one column, so the
          button lands after every line item — you decide to share once you have
          seen where the money went, not before. The two-column layout puts it
          back under the summary via grid-template-areas. */}
      <div className="result-share">
        <button type="button" onClick={onShare} className="btn-cta" style={{ width: "100%", border: 0, borderRadius: 999, background: "var(--color-accent)", color: "var(--color-bg)", font: "inherit", fontSize: 16, fontWeight: 700, padding: 17, cursor: "pointer", minHeight: 54 }}>
          Share this receipt
        </button>
      </div>
    </div>
  );
}
