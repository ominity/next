import type { CommerceAmount } from "./types.js";

type UnknownRecord = Record<string, unknown>;

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null ? value as UnknownRecord : null;
}

function extractAmount(value: unknown): number | undefined {
  const direct = asNumber(value);
  if (typeof direct === "number") {
    return direct;
  }

  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return asNumber(record.value)
    ?? asNumber(record.amount)
    ?? asNumber(record.gross)
    ?? asNumber(record.price);
}

export type CommercePriceMapLike = Readonly<Record<string, unknown>>;

export interface ResolvePriceFromPriceMapInput {
  readonly prices: CommercePriceMapLike;
  readonly preferredCurrency?: string;
  readonly allowedCurrencies?: ReadonlyArray<string>;
  readonly fallbackCurrency?: string;
}

export function resolvePriceFromPriceMap(
  input: ResolvePriceFromPriceMapInput,
): CommerceAmount | null {
  const normalizedEntries = Object.entries(input.prices)
    .map(([currency, value]) => ({
      currency: currency.trim().toUpperCase(),
      amount: extractAmount(value),
    }))
    .filter((entry): entry is { currency: string; amount: number } => {
      return entry.currency.length > 0 && typeof entry.amount === "number";
    });

  if (normalizedEntries.length === 0) {
    return null;
  }

  const allowedSet = new Set((input.allowedCurrencies ?? []).map((entry) => entry.trim().toUpperCase()));
  const isAllowedCurrency = (currency: string): boolean => {
    if (allowedSet.size === 0) {
      return true;
    }
    return allowedSet.has(currency);
  };

  const preferredCurrency = input.preferredCurrency?.trim().toUpperCase();
  if (preferredCurrency) {
    const preferred = normalizedEntries.find((entry) => {
      return entry.currency === preferredCurrency && isAllowedCurrency(entry.currency);
    });
    if (preferred) {
      return {
        currency: preferred.currency,
        value: preferred.amount,
      };
    }
  }

  const fallbackCurrency = input.fallbackCurrency?.trim().toUpperCase();
  if (fallbackCurrency) {
    const fallback = normalizedEntries.find((entry) => {
      return entry.currency === fallbackCurrency && isAllowedCurrency(entry.currency);
    });
    if (fallback) {
      return {
        currency: fallback.currency,
        value: fallback.amount,
      };
    }
  }

  const firstAllowed = normalizedEntries.find((entry) => isAllowedCurrency(entry.currency));
  if (firstAllowed) {
    return {
      currency: firstAllowed.currency,
      value: firstAllowed.amount,
    };
  }

  return null;
}
