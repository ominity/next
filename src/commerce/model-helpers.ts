import type {
  CartItem as CommerceCartItem,
} from "@ominity/api-typescript/models/commerce/cart-item";
import type {
  Order as CommerceOrder,
} from "@ominity/api-typescript/models/commerce/order";
import type {
  Payment as CommercePayment,
} from "@ominity/api-typescript/models/commerce/payment";

type UnknownRecord = Readonly<Record<string, unknown>>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null
    ? value as UnknownRecord
    : undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

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

function toStringId(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `${Math.floor(value)}`;
  }

  return undefined;
}

export function commerceMoneyValue(value: unknown): number | undefined {
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

export function commerceMoneyCurrency(value: unknown): string | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const currency = asString(record.currency) ?? asString(record.currencyCode);
  return currency ? currency.toUpperCase() : undefined;
}

function cartItemRecord(item: CommerceCartItem): UnknownRecord {
  return asRecord(item) ?? {};
}

function cartItemProduct(item: CommerceCartItem): UnknownRecord | undefined {
  const record = cartItemRecord(item);
  const embedded = asRecord(record._embedded);
  return asRecord(record.product) ?? asRecord(embedded?.product);
}

function cartItemOffer(item: CommerceCartItem): UnknownRecord | undefined {
  const record = cartItemRecord(item);
  const embedded = asRecord(record._embedded);
  return asRecord(record.offer) ?? asRecord(embedded?.offer);
}

export function commerceCartItemId(item: CommerceCartItem): string {
  return toStringId(cartItemRecord(item).id) ?? "";
}

export function commerceCartItemProductId(item: CommerceCartItem): string | undefined {
  const record = cartItemRecord(item);
  const product = cartItemProduct(item);

  return toStringId(record.productId ?? record.product_id ?? product?.id);
}

export function commerceCartItemSku(item: CommerceCartItem): string | undefined {
  const record = cartItemRecord(item);
  const product = cartItemProduct(item);
  return asString(record.sku) ?? asString(product?.sku);
}

export function commerceCartItemTitle(item: CommerceCartItem): string {
  const record = cartItemRecord(item);
  const product = cartItemProduct(item);
  return asString(record.title)
    ?? asString(record.name)
    ?? asString(product?.title)
    ?? asString(product?.shortTitle)
    ?? commerceCartItemSku(item)
    ?? commerceCartItemId(item);
}

export function commerceCartItemQuantity(item: CommerceCartItem): number {
  const quantity = asNumber(cartItemRecord(item).quantity) ?? 1;
  return quantity > 0 ? Math.floor(quantity) : 1;
}

export function commerceCartItemUnitPrice(item: CommerceCartItem): number {
  const record = cartItemRecord(item);
  const offer = cartItemOffer(item);
  return commerceMoneyValue(record.unitPrice)
    ?? commerceMoneyValue(record.unitAmount)
    ?? commerceMoneyValue(record.price)
    ?? commerceMoneyValue(offer?.unitPrice)
    ?? commerceMoneyValue(offer?.unitAmount)
    ?? commerceMoneyValue(offer?.amount)
    ?? 0;
}

export function commerceCartItemTotalPrice(item: CommerceCartItem): number {
  const record = cartItemRecord(item);
  const offer = cartItemOffer(item);
  return commerceMoneyValue(record.totalPrice)
    ?? commerceMoneyValue(record.totalAmount)
    ?? commerceMoneyValue(record.total)
    ?? commerceMoneyValue(offer?.totalPrice)
    ?? commerceMoneyValue(offer?.totalAmount)
    ?? commerceMoneyValue(offer?.amount)
    ?? commerceCartItemUnitPrice(item) * commerceCartItemQuantity(item);
}

export function commerceCartItemCurrency(item: CommerceCartItem): string {
  const record = cartItemRecord(item);
  const product = cartItemProduct(item);
  const offer = cartItemOffer(item);

  const currency = commerceMoneyCurrency(record.unitPrice)
    ?? commerceMoneyCurrency(record.unitAmount)
    ?? commerceMoneyCurrency(record.totalPrice)
    ?? commerceMoneyCurrency(record.totalAmount)
    ?? commerceMoneyCurrency(offer?.unitPrice)
    ?? commerceMoneyCurrency(offer?.unitAmount)
    ?? commerceMoneyCurrency(offer?.amount)
    ?? asString(record.currency)
    ?? asString(product?.currency)
    ?? "EUR";

  return currency.toUpperCase();
}

export function commerceOrderId(order: CommerceOrder): string {
  return toStringId((order as unknown as { id?: unknown }).id) ?? "";
}

export function commerceOrderTotal(order: CommerceOrder): number {
  return commerceMoneyValue(order.totalAmount) ?? 0;
}

export function commerceOrderCurrency(order: CommerceOrder): string {
  return (commerceMoneyCurrency(order.totalAmount) ?? "EUR").toUpperCase();
}

export function commercePaymentId(payment: CommercePayment): string {
  return toStringId((payment as unknown as { id?: unknown }).id) ?? "";
}

export function commercePaymentAmount(payment: CommercePayment): number {
  return commerceMoneyValue(payment.amount) ?? 0;
}

export function commercePaymentCurrency(payment: CommercePayment): string {
  return (commerceMoneyCurrency(payment.amount) ?? "EUR").toUpperCase();
}
