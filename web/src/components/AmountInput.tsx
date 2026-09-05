import { useState } from "react";

import { SURCHARGE_RATES } from "../lib/allocate";
import { formatInr } from "../lib/format";
import { guessSurcharge } from "../lib/surcharge";
import type { YearStub } from "../lib/model";

const PRESETS = [25_000, 120_000, 600_000];

/** A financial year "2025-26" ends 31 March 2026 — known, not guessed. */
function fyHasEnded(id: string): boolean {
  const startYear = Number.parseInt(id.slice(0, 4), 10);
  return Date.now() > new Date(startYear + 1, 2, 31, 23, 59, 59).getTime();
}

interface Props {
  amountStr: string;
  amount: number;
  surcharge: number;
  /** True while the surcharge shown is guessed rather than answered. */
  surchargeAuto: boolean;
  year: string;
  years: YearStub[];
  onAmount: (raw: string) => void;
  onSurcharge: (value: number) => void;
  onYear: (id: string) => void;
  onSubmit: () => void;
}

export function AmountInput({
  amountStr, amount, surcharge, surchargeAuto, year, years,
  onAmount, onSurcharge, onYear, onSubmit,
}: Props) {
  // Set only by clicking a year button, never by the initial prop value — so
  // the note below never shows just because a not-yet-settled year happens to
  // be the default. It should only answer a click, not greet arrival.
  const [picked, setPicked] = useState(false);
  const selected = years.find((y) => y.id === year);

  // Shown only while the buttons below are still answering for the reader. Once
  // they press one, the question is theirs and the explanation is spent.
  const guess = surchargeAuto ? guessSurcharge(amount) : null;
  const selectedNote =
    picked && selected && selected.status !== "actual-final"
      ? fyHasEnded(selected.id)
        ? "These are revised estimates, not final figures yet, and you might not have paid the full year's tax either."
        : "This financial year hasn't ended yet, so you haven't paid a full year's tax under it."
      : null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", width: "100%", maxWidth: 560, marginInline: "auto", padding: "0 clamp(22px, 4vw, 48px) 34px" }}>
      <div style={{ paddingTop: 34 }}>
        <h2 style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: "clamp(32px, 3vw, 40px)", lineHeight: 1.06, letterSpacing: "-0.02em" }}>
          What did you pay?
        </h2>
        <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: 1.5, color: "var(--color-neutral-800)" }}>
          Everything you paid the government in direct income tax last year: the tax cut from your salary
          before it reached you, plus anything you paid yourself while filing your taxes.
        </p>
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--color-neutral-100)", border: "1.5px solid var(--color-neutral-300)", borderRadius: 999, padding: "14px 24px" }}>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 30, lineHeight: 1, color: "var(--color-neutral-500)" }}>₹</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="1,20,000"
            aria-label="Income tax paid, in rupees"
            value={amountStr}
            onChange={(e) => onAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && amount > 0) onSubmit();
            }}
            style={{ flex: 1, minWidth: 0, background: "none", border: 0, outline: "none", fontFamily: "var(--font-heading)", fontSize: 30, lineHeight: 1.1, color: "var(--color-text)", padding: 0, width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onAmount(String(value))}
              className="chip"
              style={{ border: "1px solid var(--color-divider)", background: "none", borderRadius: 999, padding: "12px 18px", minHeight: 44, font: "inherit", fontSize: 13, cursor: "pointer", color: "var(--color-text)" }}
            >
              {formatInr(value)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--color-neutral-700)" }}>
          Did you pay a surcharge?
        </p>
        <p style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.45, color: "var(--color-neutral-700)" }}>
          A surcharge is an extra percentage added to the tax of people earning above ₹50 lakh a year.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SURCHARGE_RATES.map((option) => {
            const on = surcharge === option.value;
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={on}
                onClick={() => onSurcharge(option.value)}
                style={{
                  border: `1.5px solid ${on ? "var(--color-accent)" : "var(--color-divider)"}`,
                  background: on ? "var(--color-accent)" : "transparent",
                  color: on ? "var(--color-bg)" : "var(--color-text)",
                  borderRadius: 999, padding: "11px 16px", minHeight: 44,
                  font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.45, color: "var(--color-neutral-800)" }}>
          {guess
            ? `Tax of ${formatInr(amount)} can only come from an income above ${guess.incomeLabel}, so we have started you at ${Math.round(guess.rate * 100)}%. Change it if that is not what you paid.`
            : "Most people pay none, so leave this alone if you are not sure."}{" "}
          It changes how much of your money reaches your state.
        </p>
      </div>

      <div style={{ marginTop: 26, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px" }}>
        <span style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>Financial year</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {years.map((option) => {
            const on = year === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={on}
                title={option.tag}
                onClick={() => {
                  setPicked(true);
                  onYear(option.id);
                }}
                className="year-pick"
                style={{
                  border: 0,
                  borderBottom: `2px solid ${on ? "var(--color-accent)" : "transparent"}`,
                  background: "none",
                  color: on ? "var(--color-text)" : "var(--color-neutral-700)",
                  padding: "10px 4px", minHeight: 44, font: "inherit", fontSize: 13,
                  fontWeight: on ? 700 : 500, cursor: "pointer",
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {selectedNote ? (
          <p style={{ margin: "8px 0 0", width: "100%", fontSize: 12, lineHeight: 1.45, color: "var(--color-neutral-700)" }}>
            {selectedNote}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={amount <= 0}
        className="btn-cta"
        style={{
          width: "100%", marginTop: 26, border: 0, borderRadius: 999,
          background: "var(--color-accent)", color: "var(--color-bg)",
          font: "inherit", fontSize: 17, fontWeight: 700, padding: 18,
          cursor: amount > 0 ? "pointer" : "not-allowed", minHeight: 56,
          opacity: amount > 0 ? 1 : 0.45,
        }}
      >
        Break it down
      </button>
    </div>
  );
}
