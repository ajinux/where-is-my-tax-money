import type { Built } from "../lib/build";
import { ExternalIcon } from "./Logo";
import { RowItem } from "./RowItem";

interface Props {
  built: Built;
  backLabel: string;
  copiedRow: string | null;
  /** The row a shared link points at, by id. */
  focusId: string | null;
  onBack: () => void;
  onOpenSub: (index: number) => void;
  onCopyRow: (id: string) => void;
  onShare: () => void;
}

export function Detail({
  built, backLabel, copiedRow, focusId,
  onBack, onOpenSub, onCopyRow, onShare,
}: Props) {
  const { head, inside } = built;
  if (!head) return null;

  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(330px, 100%), 1fr))", gap: "0 clamp(0px, 4vw, 56px)", alignItems: "start", padding: "0 clamp(22px, 4vw, 48px) 40px" }}>
      <div>
        <button type="button" onClick={onBack} className="chip" style={{ alignSelf: "flex-start", marginTop: 22, background: "none", border: "1px solid var(--color-divider)", borderRadius: 999, padding: "10px 18px", font: "inherit", fontSize: 13, cursor: "pointer", color: "var(--color-text)", minHeight: 44 }}>
          {backLabel}
        </button>

        <div style={{ padding: "24px 0 0" }}>
          {/* Shown at every depth. The comp gated this behind "arrived by a shared
              link", which made it a navigation aid that was absent exactly when
              you were navigating. Two blocks is the floor — one block compares
              nothing, which happens at depth when a head has a single child. */}
          {built.strip.length > 1 ? (
            <>
              <div style={{ display: "flex", gap: 3, alignItems: "stretch" }} aria-hidden="true">
                {built.strip.map((block) => (
                  <span key={block.id} style={{ display: "block", borderRadius: 999, background: block.tone, width: block.width, minWidth: 5, height: 30 }} />
                ))}
              </div>
              <p style={{ margin: "9px 0 0", fontSize: 12, color: "var(--color-neutral-700)" }}>
                {built.stripLabel}
              </p>
            </>
          ) : null}

          <h2 style={{ margin: "18px 0 0", fontFamily: "var(--font-heading)", fontSize: "clamp(30px, 2.8vw, 38px)", lineHeight: 1.08, letterSpacing: "-0.02em", textWrap: "pretty" }}>
            {head.label}
          </h2>
          {head.note ? (
            <p style={{ margin: "14px 0 0", fontSize: 16, lineHeight: 1.5, color: "var(--color-neutral-800)", textWrap: "pretty" }}>
              {head.note}
            </p>
          ) : null}
          {head.url ? (
            <a href={head.url} target="_blank" rel="noopener" style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 14, minHeight: 44, fontSize: 14, fontWeight: 600 }}>
              {head.urlLabel ?? "Read more"}
              <ExternalIcon />
            </a>
          ) : null}
        </div>

        <div style={{ marginTop: 24, background: "var(--color-surface)", borderRadius: "var(--radius-lg)", padding: 22 }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>Your share</p>
              <p style={{ margin: "8px 0 0", fontFamily: "var(--font-heading)", fontSize: 32, lineHeight: 1, letterSpacing: "-0.02em" }}>{head.amount}</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>Of what you paid</p>
              <p style={{ margin: "8px 0 0", fontFamily: "var(--font-heading)", fontSize: 32, lineHeight: 1, letterSpacing: "-0.02em" }}>{head.percentText}</p>
            </div>
          </div>
          <div style={{ marginTop: 18, height: 10, borderRadius: 999, background: "var(--color-neutral-200)", overflow: "hidden" }}>
            <span style={{ height: 10, borderRadius: 999, display: "block", background: head.tone, width: head.bar }} />
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--color-neutral-800)" }}>
            {head.national} was spent on this across the whole country.
          </p>
        </div>

        {head.aside ? (
          <p style={{ margin: "20px 0 0", padding: "16px 18px", background: "var(--color-accent-2-200)", borderRadius: "var(--radius-lg)", fontSize: 14, lineHeight: 1.5, color: "var(--color-accent-2-900)", textWrap: "pretty" }}>
            {head.aside}
          </p>
        ) : null}
      </div>

      <div>
        {inside.length ? (
          <>
            <p style={{ margin: "28px 0 12px", fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>
              {head.insideLabel}
            </p>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {inside.map((row, index) => (
                <RowItem
                  key={row.id}
                  row={row}
                  copied={copiedRow === row.id}
                  focused={row.id === focusId}
                  showDesc
                  shareOfParent={percentOfParent(row.yours, head)}
                  variant="nested"
                  onCopy={() => onCopyRow(row.id)}
                  onOpen={row.hasChildren ? () => onOpenSub(index) : undefined}
                  openLabel={row.hasChildren ? "Go deeper" : undefined}
                />
              ))}
              <div style={{ borderTop: "1px solid var(--color-divider)" }} />
            </div>
          </>
        ) : (
          // The dataset stops where the government stops publishing. Saying so is
          // better than an empty panel that looks like a loading failure.
          <p style={{ margin: "28px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--color-neutral-700)" }}>
            The budget papers do not break this down any further, so neither do we.
          </p>
        )}

        <button type="button" onClick={onShare} className="btn-cta" style={{ width: "100%", marginTop: 24, border: 0, borderRadius: 999, background: "var(--color-accent)", color: "var(--color-bg)", font: "inherit", fontSize: 16, fontWeight: 700, padding: 17, cursor: "pointer", minHeight: 54 }}>
          Share this part
        </button>
      </div>
    </div>
  );
}

/** A child's share of the head it sits under, which is what the row line claims. */
function percentOfParent(value: number, head: { amount: string }): string | undefined {
  const parent = Number(head.amount.replace(/[^0-9]/g, ""));
  if (!parent) return undefined;
  return `${((value / parent) * 100).toFixed(1)}%`;
}
