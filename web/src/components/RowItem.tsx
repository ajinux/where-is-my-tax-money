// One row of the breakdown: label, the reader's own figure, a bar, and the line
// underneath giving its share and the national total.
//
// Two variants, because the comp draws two. The top-level list on the result
// screen is a plain rule-separated row; the nested list inside a head is a
// smaller, padded, rounded block. Merging them into one shape lost the rounded
// container and flattened the type scale, so the difference is expressed here
// rather than left to whoever renders it.

import { useEffect, useRef } from "react";

import type { DisplayRow } from "../lib/build";
import { CheckIcon, LinkIcon } from "./Logo";

type Variant = "top" | "nested";

/** The comp's two type scales, kept side by side so the difference is legible. */
const SCALE: Record<Variant, {
  label: number;
  labelLine: number;
  amount: number;
  barGap: number;
  barHeight: number;
}> = {
  top: { label: 15, labelLine: 1.3, amount: 17, barGap: 9, barHeight: 8 },
  nested: { label: 14, labelLine: 1.35, amount: 16, barGap: 8, barHeight: 6 },
};

interface Props {
  row: DisplayRow;
  copied: boolean;
  onCopy: () => void;
  /** Absent for rows that do not open — a leaf with nothing below it. */
  onOpen?: () => void;
  /** Shown under the row once opened: the fuller "what this bought" text. */
  showDesc?: boolean;
  openLabel?: string;
  /** Highlighted and scrolled to, because a shared link points at this row. */
  focused?: boolean;
  /** Share of the row above, rather than of everything paid. */
  shareOfParent?: string;
  variant?: Variant;
}

export function RowItem({
  row,
  copied,
  onCopy,
  onOpen,
  showDesc,
  openLabel,
  focused,
  shareOfParent,
  variant = "top",
}: Props) {
  const nested = variant === "nested";
  const scale = SCALE[variant];
  const box = useRef<HTMLDivElement>(null);

  // Bring a linked row into view. This lives on the row rather than on the two
  // screens that render lists, so there is one implementation and no
  // querySelector hunting for whichever row is lit. `focused` is only ever set
  // from the URL, so this fires on arrival and not while someone is navigating.
  useEffect(() => {
    if (!focused || !box.current) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    box.current.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
  }, [focused]);

  const body = (
    <>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: scale.label, fontWeight: 600, lineHeight: scale.labelLine }}>
          {row.label}
        </span>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: scale.amount, whiteSpace: "nowrap" }}>
          {row.amount}
        </span>
      </div>
      <div
        style={{
          marginTop: scale.barGap,
          height: scale.barHeight,
          borderRadius: 999,
          background: "var(--color-neutral-200)",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            height: scale.barHeight,
            borderRadius: 999,
            display: "block",
            background: row.tone,
            width: row.barWidth,
          }}
        />
      </div>
    </>
  );

  // The nested row is a padded, rounded block that bleeds 8px past its column on
  // each side. The negative margin is what makes the padding invisible: without
  // it the 10px inset would push every row's text out of line with the heading
  // above. The radius is the curve the design shows on these rows.
  const container: React.CSSProperties = nested
    ? {
        padding: "14px 10px",
        margin: "0 -8px",
        borderTop: "1px solid var(--color-divider)",
        borderRadius: "var(--radius-md)",
      }
    : {
        borderTop: "1px solid var(--color-divider)",
      };

  // The linked row has to be findable in a list of fifty-six. The tint alone is
  // #fff2eb on a #f5ead8 ground, which is a difference you have to be told about,
  // so it carries a ring as well. The top-level variant has no box of its own to
  // ring, so it borrows one: the inline padding and the negative margin cancel
  // exactly, which lets the tint bleed past the column without moving the text.
  if (focused) {
    container.background = "var(--color-accent-100)";
    container.borderRadius = "var(--radius-md)";
    container.boxShadow = "inset 0 0 0 2px var(--color-accent-300)";
    // The ring is this row's edge now. The divider would otherwise draw a square
    // line across its rounded top; kept transparent so nothing below shifts 1px.
    container.borderTop = "1px solid transparent";
    if (!nested) {
      container.paddingInline = 10;
      container.marginInline = -10;
    }
  }

  // Hover lives on whichever element owns the rounded box, so it cannot paint a
  // square over a curved corner. A row already tinted by a shared link keeps its
  // tint rather than being overpainted.
  const hoverTarget = onOpen && !focused;

  return (
    <div
      ref={box}
      data-row="1"
      className={
        [nested && hoverTarget ? "row-nested" : "", focused ? "row-focus" : ""]
          .filter(Boolean)
          .join(" ") || undefined
      }
      style={container}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className={nested ? undefined : "row-open"}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            background: "none",
            border: 0,
            // The nested container already supplies the padding.
            padding: nested ? 0 : "14px 2px 10px",
            cursor: "pointer",
            font: "inherit",
            color: "var(--color-text)",
            minHeight: nested ? undefined : 44,
          }}
        >
          {body}
        </button>
      ) : (
        <div style={{ padding: nested ? 0 : "14px 2px 10px" }}>{body}</div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginTop: nested ? 7 : 0,
          padding: nested ? 0 : "0 2px 6px",
        }}
      >
        <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>
          {shareOfParent ? `${shareOfParent} of the money above` : row.percentText} · {row.national}{" "}
          nationwide
        </span>
        <button
          type="button"
          data-row-copy="1"
          onClick={onCopy}
          title={copied ? "Link copied" : "Copy a link to this part"}
          aria-label={copied ? "Link copied" : "Copy a link to this part"}
          style={{
            display: "grid",
            placeItems: "center",
            width: 44,
            height: 40,
            flex: "none",
            background: "none",
            border: 0,
            padding: 0,
            cursor: "pointer",
            color: copied ? "var(--color-accent)" : "var(--color-neutral-500)",
          }}
        >
          {copied ? <CheckIcon /> : <LinkIcon />}
        </button>
      </div>

      {showDesc && row.desc ? (
        <p
          style={{
            margin: nested ? "8px 0 0" : "0 2px 12px",
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--color-neutral-800)",
            textWrap: "pretty",
          }}
        >
          {row.desc}
        </p>
      ) : null}

      {onOpen && openLabel ? (
        <button
          type="button"
          onClick={onOpen}
          className="link-btn"
          style={{
            background: "none",
            border: 0,
            padding: nested ? "8px 0 4px" : "0 2px 12px",
            minHeight: 44,
            cursor: "pointer",
            font: "inherit",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-accent-700)",
          }}
        >
          {openLabel} →
        </button>
      ) : null}
    </div>
  );
}
