"use client";

import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { OminityDebugTheme } from "./types.js";

export type Tone = "default" | "success" | "warning" | "danger" | "info";

export interface Palette {
  readonly mode: "light" | "dark";
  readonly panel: string;
  readonly panelMuted: string;
  readonly panelStrong: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly text: string;
  readonly muted: string;
  readonly faint: string;
  readonly inverseText: string;
  readonly code: string;
  readonly danger: string;
  readonly dangerSoft: string;
  readonly warning: string;
  readonly success: string;
  readonly info: string;
  readonly shadow: string;
}

export const MONO_FONT = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
export const BODY_FONT = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

const LIGHT: Palette = {
  mode: "light",
  panel: "rgb(255 255 255 / 96%)",
  panelMuted: "rgb(250 250 250)",
  panelStrong: "rgb(244 244 245)",
  border: "rgb(212 212 216 / 78%)",
  borderStrong: "rgb(161 161 170)",
  text: "rgb(24 24 27)",
  muted: "rgb(82 82 91)",
  faint: "rgb(113 113 122)",
  inverseText: "rgb(250 250 250)",
  code: "rgb(39 39 42)",
  danger: "rgb(185 28 28)",
  dangerSoft: "rgb(254 242 242)",
  warning: "rgb(180 83 9)",
  success: "rgb(21 128 61)",
  info: "rgb(37 99 235)",
  shadow: "0 24px 60px rgb(0 0 0 / 18%), 0 8px 18px rgb(0 0 0 / 12%)",
};

const DARK: Palette = {
  mode: "dark",
  panel: "rgb(24 24 27 / 97%)",
  panelMuted: "rgb(39 39 42)",
  panelStrong: "rgb(63 63 70)",
  border: "rgb(82 82 91 / 78%)",
  borderStrong: "rgb(161 161 170)",
  text: "rgb(244 244 245)",
  muted: "rgb(212 212 216)",
  faint: "rgb(161 161 170)",
  inverseText: "rgb(24 24 27)",
  code: "rgb(244 244 245)",
  danger: "rgb(248 113 113)",
  dangerSoft: "rgb(69 10 10 / 55%)",
  warning: "rgb(251 191 36)",
  success: "rgb(74 222 128)",
  info: "rgb(147 197 253)",
  shadow: "0 24px 60px rgb(0 0 0 / 48%), 0 8px 18px rgb(0 0 0 / 30%)",
};

export function useSystemDarkMode(): boolean {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(query.matches);
    const listener = (event: MediaQueryListEvent) => setDark(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return dark;
}

export function resolvePalette(theme: OminityDebugTheme, systemDark: boolean): Palette {
  if (theme === "dark" || (theme === "system" && systemDark)) {
    return DARK;
  }

  return LIGHT;
}

function prettyJsonOrRaw(input: string): string {
  try {
    return JSON.stringify(JSON.parse(input), null, 2);
  } catch {
    return input;
  }
}

function nextNonWhitespaceChar(input: string, fromIndex: number): string | null {
  for (let index = fromIndex; index < input.length; index += 1) {
    const character = input[index];
    if (typeof character === "string" && character.trim().length > 0) {
      return character;
    }
  }

  return null;
}

function jsonTokenColor(token: string, source: string, tokenEndIndex: number, palette: Palette): string {
  if (token.startsWith("\"")) {
    return nextNonWhitespaceChar(source, tokenEndIndex) === ":"
      ? palette.info
      : palette.success;
  }

  if (token === "true" || token === "false") {
    return palette.warning;
  }

  if (token === "null") {
    return palette.faint;
  }

  return palette.danger;
}

function renderHighlightedJson(input: string, palette: Palette) {
  const tokenPattern = /"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  const result: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of input.matchAll(tokenPattern)) {
    const text = match[0];
    const start = match.index ?? 0;

    if (start > cursor) {
      result.push(<span key={`plain-${tokenIndex}`}>{input.slice(cursor, start)}</span>);
      tokenIndex += 1;
    }

    const end = start + text.length;
    result.push(
      <span key={`token-${tokenIndex}`} style={{ color: jsonTokenColor(text, input, end, palette) }}>
        {text}
      </span>,
    );
    tokenIndex += 1;
    cursor = end;
  }

  if (cursor < input.length) {
    result.push(<span key={`plain-${tokenIndex}`}>{input.slice(cursor)}</span>);
  }

  return result;
}

export function renderCodeBlock(input: string, palette: Palette) {
  const display = prettyJsonOrRaw(input);
  return (
    <pre
      style={{
        margin: 0,
        marginTop: "7px",
        overflow: "auto",
        whiteSpace: "pre-wrap",
        borderRadius: "6px",
        padding: "9px",
        border: `1px solid ${palette.border}`,
        backgroundColor: palette.panel,
        color: palette.code,
        fontFamily: MONO_FONT,
        fontSize: "11px",
        lineHeight: 1.55,
      }}
    >
      {renderHighlightedJson(display, palette)}
    </pre>
  );
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function displayValue(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "Enabled" : "Disabled";
  }

  if (value === null || typeof value === "undefined" || value === "") {
    return "n/a";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return JSON.stringify(value);
}

export function sectionTitleStyle(palette: Palette): CSSProperties {
  return {
    margin: 0,
    color: palette.text,
    fontSize: "12px",
    fontWeight: 700,
    lineHeight: 1.2,
  };
}

export function mutedTextStyle(palette: Palette): CSSProperties {
  return {
    color: palette.faint,
    fontSize: "11px",
    lineHeight: 1.5,
  };
}

export function buttonStyle(palette: Palette, active = false): CSSProperties {
  return {
    border: `1px solid ${active ? palette.text : palette.border}`,
    borderRadius: "6px",
    backgroundColor: active ? palette.text : palette.panel,
    color: active ? palette.inverseText : palette.text,
    height: "30px",
    padding: "0 9px",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

export function inputStyle(palette: Palette): CSSProperties {
  return {
    border: `1px solid ${palette.border}`,
    borderRadius: "6px",
    backgroundColor: palette.panel,
    color: palette.text,
    height: "32px",
    minWidth: 0,
    padding: "0 9px",
    fontSize: "12px",
    outline: "none",
  };
}

export function pillStyle(palette: Palette, tone: Tone = "default"): CSSProperties {
  const color = tone === "success"
    ? palette.success
    : tone === "warning"
      ? palette.warning
      : tone === "danger"
        ? palette.danger
        : tone === "info"
          ? palette.info
          : palette.muted;

  return {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "20px",
    borderRadius: "5px",
    border: `1px solid ${palette.border}`,
    backgroundColor: palette.panelStrong,
    color,
    padding: "2px 6px",
    fontSize: "10px",
    fontFamily: MONO_FONT,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  };
}

export function Field(props: {
  readonly label: string;
  readonly value: unknown;
  readonly palette: Palette;
  readonly mono?: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: props.palette.faint, fontSize: "10px", marginBottom: "3px" }}>{props.label}</div>
      <div
        style={{
          color: props.palette.text,
          fontSize: "12px",
          fontFamily: props.mono ? MONO_FONT : BODY_FONT,
          overflowWrap: "anywhere",
          lineHeight: 1.35,
        }}
      >
        {displayValue(props.value)}
      </div>
    </div>
  );
}

export function Panel(props: {
  readonly children: ReactNode;
  readonly palette: Palette;
  readonly style?: CSSProperties;
}) {
  return (
    <div
      style={{
        border: `1px solid ${props.palette.border}`,
        borderRadius: "8px",
        backgroundColor: props.palette.panelMuted,
        padding: "10px",
        minWidth: 0,
        ...props.style,
      }}
    >
      {props.children}
    </div>
  );
}

export function Metric(props: {
  readonly label: string;
  readonly value: unknown;
  readonly palette: Palette;
  readonly tone?: Tone;
}) {
  const color = props.tone === "success"
    ? props.palette.success
    : props.tone === "warning"
      ? props.palette.warning
      : props.tone === "danger"
        ? props.palette.danger
        : props.tone === "info"
          ? props.palette.info
          : props.palette.text;

  return (
    <Panel palette={props.palette} style={{ padding: "9px" }}>
      <div style={{ color: props.palette.faint, fontSize: "10px", marginBottom: "5px" }}>{props.label}</div>
      <div style={{ color, fontSize: "17px", fontWeight: 750, lineHeight: 1 }}>{displayValue(props.value)}</div>
    </Panel>
  );
}

export function EmptyState(props: {
  readonly children: ReactNode;
  readonly palette: Palette;
}) {
  return (
    <div style={{ color: props.palette.faint, fontSize: "12px", padding: "14px 4px", lineHeight: 1.5 }}>
      {props.children}
    </div>
  );
}

export function JsonPanel(props: {
  readonly title: string;
  readonly value: unknown;
  readonly palette: Palette;
}) {
  if (typeof props.value === "undefined") {
    return null;
  }

  return (
    <details style={{ border: `1px solid ${props.palette.border}`, borderRadius: "8px", padding: "9px", backgroundColor: props.palette.panelMuted }}>
      <summary style={{ cursor: "pointer", color: props.palette.text, fontSize: "12px", fontWeight: 650 }}>
        {props.title}
      </summary>
      {renderCodeBlock(JSON.stringify(props.value, null, 2), props.palette)}
    </details>
  );
}
