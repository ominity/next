import type { Cart } from "@ominity/api-typescript/models/commerce/cart";
import type { CartItem } from "@ominity/api-typescript/models/commerce/cart-item";
import type { Order } from "@ominity/api-typescript/models/commerce/order";
import type { Payment } from "@ominity/api-typescript/models/commerce/payment";

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

function requiredMoneyValue(value: unknown): number {
  return commerceMoneyValue(value) ?? 0;
}

export function commerceMoneyCurrency(value: unknown): string | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const currency = asString(record.currency) ?? asString(record.currencyCode);
  return currency ? currency.toUpperCase() : undefined;
}

function cartItemRecord(item: CartItem): UnknownRecord {
  return asRecord(item) ?? {};
}

function cartItemProduct(item: CartItem): UnknownRecord | undefined {
  const record = cartItemRecord(item);
  const embedded = asRecord(record._embedded);
  return asRecord(record.product) ?? asRecord(embedded?.product);
}

function cartItemOffer(item: CartItem): UnknownRecord | undefined {
  const record = cartItemRecord(item);
  const embedded = asRecord(record._embedded);
  return asRecord(record.offer) ?? asRecord(embedded?.offer);
}

export function commerceCartItemId(item: CartItem): string {
  return toStringId(cartItemRecord(item).id) ?? "";
}

export function commerceCartItemProductId(item: CartItem): string | undefined {
  const record = cartItemRecord(item);
  const product = cartItemProduct(item);

  return toStringId(record.productId ?? record.product_id ?? product?.id);
}

export function commerceCartItemSku(item: CartItem): string | undefined {
  const record = cartItemRecord(item);
  const product = cartItemProduct(item);
  return asString(record.sku) ?? asString(product?.sku);
}

export function commerceCartItemTitle(item: CartItem): string {
  const record = cartItemRecord(item);
  const product = cartItemProduct(item);
  return asString(record.title)
    ?? asString(record.name)
    ?? asString(product?.title)
    ?? asString(product?.shortTitle)
    ?? commerceCartItemSku(item)
    ?? commerceCartItemId(item);
}

export function commerceCartItemQuantity(item: CartItem): number {
  const quantity = asNumber(cartItemRecord(item).quantity) ?? 1;
  return quantity > 0 ? Math.floor(quantity) : 1;
}

export function commerceCartItemUnitPrice(item: CartItem): number {
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

export function commerceCartItemTotalPrice(item: CartItem): number {
  const record = cartItemRecord(item);
  const offer = cartItemOffer(item);
  return commerceMoneyValue(record.totalPrice)
    ?? commerceMoneyValue(record.totalAmount)
    ?? commerceMoneyValue(record.total)
    ?? commerceMoneyValue(offer?.totalPrice)
    ?? commerceMoneyValue(offer?.totalAmount)
    ?? 0;
}

/**
 * Cart summary values always come from the cart returned by Ominity. Item
 * prices are deliberately not summed here because the backend owns pricing,
 * discounts, shipping and tax calculations for the active channel/context.
 */
export function commerceCartSubtotal(cart: Cart): number {
  return requiredMoneyValue(cart.subtotalAmount);
}

export function commerceCartShipping(cart: Cart): number {
  return requiredMoneyValue(cart.shippingAmount);
}

export function commerceCartDiscount(cart: Cart): number {
  return requiredMoneyValue(cart.discountAmount);
}

export function commerceCartTax(cart: Cart): number {
  return requiredMoneyValue(cart.taxAmount);
}

export function commerceCartTotal(cart: Cart): number {
  return requiredMoneyValue(cart.totalAmount);
}

export function commerceCartCurrency(cart: Cart): string {
  return cart.currency.toUpperCase();
}

export function commerceCartCount(cart: Cart): number {
  return cart.totalQuantity;
}

export function commerceCartItemCurrency(item: CartItem): string | undefined {
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
    ?? asString(product?.currency);

  return currency?.toUpperCase();
}

export function commerceOrderId(order: Order): string {
  return toStringId((order as unknown as { id?: unknown }).id) ?? "";
}

export function commerceOrderTotal(order: Order): number {
  return requiredMoneyValue(order.totalAmount);
}

export function commerceOrderCurrency(order: Order): string {
  return order.totalAmount.currency.toUpperCase();
}

export function commercePaymentId(payment: Payment): string {
  return toStringId((payment as unknown as { id?: unknown }).id) ?? "";
}

export function commercePaymentAmount(payment: Payment): number {
  return requiredMoneyValue(payment.amount);
}

export function commercePaymentCurrency(payment: Payment): string {
  return payment.amount.currency.toUpperCase();
}
