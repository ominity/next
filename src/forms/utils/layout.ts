import type { OminityFormField } from "../types.js";

const DEFAULT_FLEX_TRACK = "1fr";

const PERCENTAGE_PATTERN = /^-?\d+(\.\d+)?%$/;

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x || 1;
};

const countDecimalPlaces = (value: string): number => {
  const [, decimals] = value.split(".");
  return decimals ? decimals.replace(/[^0-9]/g, "").length : 0;
};

const normalizePercentageRatios = (
  entries: Array<{ index: number; raw: string; value: number }>,
): Map<number, number> => {
  if (!entries.length) {
    return new Map();
  }

  const positiveEntries = entries.filter((entry) => entry.value > 0);
  if (!positiveEntries.length) {
    return new Map(
      entries.map((entry) => [entry.index, 0]),
    );
  }

  const maxDecimals = positiveEntries.reduce(
    (acc, entry) => Math.max(acc, countDecimalPlaces(entry.raw)),
    0,
  );
  const scale = 10 ** maxDecimals;

  const scaledEntries = positiveEntries.map((entry) => ({
    index: entry.index,
    scaledValue: Math.round(entry.value * scale),
  }));

  const firstScaledEntry = scaledEntries[0];
  if (!firstScaledEntry) {
    return new Map(entries.map((entry) => [entry.index, 0]));
  }

  const divisor = scaledEntries.reduce(
    (acc, entry) => gcd(acc, entry.scaledValue),
    firstScaledEntry.scaledValue,
  );

  const ratios = new Map<number, number>();
  entries.forEach((entry) => {
    if (entry.value <= 0) {
      ratios.set(entry.index, 0);
      return;
    }
    const scaledValue = Math.round(entry.value * scale);
    ratios.set(entry.index, scaledValue / (divisor || 1));
  });

  return ratios;
};

const wrapTrack = (value: string): string => `minmax(0, ${value})`;

export const resolveGridColumns = (fields: OminityFormField[]): string => {
  if (!fields.length) {
    return wrapTrack(DEFAULT_FLEX_TRACK);
  }

  const rawWidths = fields.map((field) =>
    typeof field.width === "string" ? field.width.trim() : "",
  );

  const percentageEntries = rawWidths
    .map((width, index) => ({ width, index }))
    .filter(({ width }) => PERCENTAGE_PATTERN.test(width))
    .map(({ width, index }) => ({
      width,
      index,
      numeric: Number.parseFloat(width.replace("%", "")),
    }))
    .filter(({ numeric }) => Number.isFinite(numeric));

  const ratios = normalizePercentageRatios(
    percentageEntries.map((entry) => ({
      index: entry.index,
      raw: entry.width.replace("%", ""),
      value: entry.numeric,
    })),
  );

  const tracks = rawWidths.map((width, index) => {
    if (ratios.has(index)) {
      const ratio = ratios.get(index) || 0;
      const safeRatio = ratio > 0 ? ratio : 1;
      return wrapTrack(`${safeRatio}fr`);
    }

    if (!width || width.toLowerCase() === "auto") {
      return wrapTrack(DEFAULT_FLEX_TRACK);
    }

    return wrapTrack(width);
  });

  return tracks.join(" ");
};
