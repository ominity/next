import type { CurrencyAmount } from "@ominity/api-typescript/models/common/amount";

/** The number in an SDK amount such as `cart.totalAmount` (`{ value: "12.50", currency: "EUR" }`); 0 when missing. */
export function commerceMoneyValue(amount: CurrencyAmount | null | undefined): number {
  const parsed = Number.parseFloat(amount?.value ?? amount?.amount ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

/** The currency of an SDK amount, upper-cased. */
export function commerceMoneyCurrency(amount: CurrencyAmount | null | undefined): string | undefined {
  return amount?.currency ? amount.currency.toUpperCase() : undefined;
}
