import { CommerceNormalizationError } from "../cms/errors.js";
import type {
  CommerceAddress,
  CommerceAmount,
  CommerceCart,
  CommerceCartItem,
  CommerceOrder,
  CommercePayment,
  CommercePaymentMethod,
  CommerceProduct,
  CommerceShippingMethod,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
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

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function toAmount(input: unknown, fallbackCurrency: string): CommerceAmount {
  if (typeof input === "number") {
    return {
      currency: fallbackCurrency,
      value: input,
    };
  }

  if (typeof input === "string") {
    const parsed = Number.parseFloat(input);
    if (Number.isFinite(parsed)) {
      return {
        currency: fallbackCurrency,
        value: parsed,
      };
    }
  }

  if (!isRecord(input)) {
    return {
      currency: fallbackCurrency,
      value: 0,
    };
  }

  const currency = asString(input.currency)
    ?? asString(input.currencyCode)
    ?? fallbackCurrency;
  const value = asNumber(input.value)
    ?? asNumber(input.amount)
    ?? asNumber(input.gross)
    ?? asNumber(input.net)
    ?? 0;

  return {
    currency: currency.toUpperCase(),
    value,
  };
}

function toAddress(input: unknown): CommerceAddress | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const address: CommerceAddress = {
    ...(typeof input.firstName === "string" ? { firstName: input.firstName } : {}),
    ...(typeof input.lastName === "string" ? { lastName: input.lastName } : {}),
    ...(typeof input.companyName === "string" ? { companyName: input.companyName } : {}),
    ...(typeof input.companyVat === "string" ? { companyVat: input.companyVat } : {}),
    ...(typeof input.email === "string" ? { email: input.email } : {}),
    ...(typeof input.phone === "string" ? { phone: input.phone } : {}),
    ...(typeof input.street === "string" ? { street: input.street } : {}),
    ...(typeof input.houseNumber === "string" ? { houseNumber: input.houseNumber } : {}),
    ...(typeof input.houseNumberAddition === "string"
      ? { houseNumberAddition: input.houseNumberAddition }
      : {}),
    ...(typeof input.postalCode === "string" ? { postalCode: input.postalCode } : {}),
    ...(typeof input.city === "string" ? { city: input.city } : {}),
    ...(typeof input.state === "string" ? { state: input.state } : {}),
    ...(typeof input.country === "string" ? { country: input.country } : {}),
    raw: input,
  };

  return address;
}

function readList(input: unknown): ReadonlyArray<unknown> {
  if (Array.isArray(input)) {
    return input;
  }

  if (!isRecord(input)) {
    return [];
  }

  if (Array.isArray(input.items)) {
    return input.items;
  }

  if (Array.isArray(input.data)) {
    return input.data;
  }

  if (isRecord(input._embedded)) {
    const embedded = input._embedded as UnknownRecord;
    const firstArray = Object.values(embedded).find((entry) => Array.isArray(entry));
    if (Array.isArray(firstArray)) {
      return firstArray;
    }
  }

  return [];
}

function requiredId(input: unknown, modelName: string): string {
  if (typeof input === "string" && input.length > 0) {
    return input;
  }

  if (typeof input === "number" && Number.isFinite(input)) {
    return `${input}`;
  }

  throw new CommerceNormalizationError(`Unable to normalize ${modelName} id.`, {
    details: {
      id: input,
    },
  });
}

export function normalizeCommerceCart(input: unknown): CommerceCart {
  const record = asRecord(input);
  const id = requiredId(record.id, "cart");
  const currency = asString(record.currency)?.toUpperCase() ?? "EUR";

  return {
    id,
    status: asString(record.status) ?? "unknown",
    type: asString(record.type) ?? "unknown",
    ...(typeof record.channelId === "number" ? { channelId: record.channelId } : {}),
    ...(typeof record.customerId === "number" || record.customerId === null
      ? { customerId: record.customerId as number | null }
      : {}),
    ...(typeof record.userId === "number" || record.userId === null
      ? { userId: record.userId as number | null }
      : {}),
    ...(typeof record.languageId === "string" || record.languageId === null
      ? { languageId: record.languageId as string | null }
      : {}),
    ...(typeof record.email === "string" ? { email: record.email } : {}),
    ...(typeof record.companyName === "string" ? { companyName: record.companyName } : {}),
    ...(typeof record.companyVat === "string" ? { companyVat: record.companyVat } : {}),
    ...(typeof record.country === "string" ? { country: record.country } : {}),
    currency,
    ...(typeof record.shippingMethodId === "string" || record.shippingMethodId === null
      ? { shippingMethodId: record.shippingMethodId as string | null }
      : {}),
    isShippingRequired: asBoolean(record.isShippingRequired, false),
    isTaxExempt: asBoolean(record.isTaxExempt, false),
    promotionCodes: Array.isArray(record.promotionCodes)
      ? record.promotionCodes.filter((entry): entry is string => typeof entry === "string")
      : [],
    totalQuantity: asNumber(record.totalQuantity) ?? 0,
    subtotalAmount: toAmount(record.subtotalAmount, currency),
    shippingAmount: toAmount(record.shippingAmount, currency),
    discountAmount: toAmount(record.discountAmount, currency),
    taxAmount: toAmount(record.taxAmount, currency),
    totalAmount: toAmount(record.totalAmount, currency),
    ...(toAddress(record.billingAddress) ? { billingAddress: toAddress(record.billingAddress)! } : {}),
    ...(toAddress(record.shippingAddress) ? { shippingAddress: toAddress(record.shippingAddress)! } : {}),
    ...(typeof record.createdAt === "string" ? { createdAt: record.createdAt } : {}),
    ...(typeof record.updatedAt === "string" ? { updatedAt: record.updatedAt } : {}),
    raw: input,
  };
}

export function normalizeCommerceCartItem(input: unknown): CommerceCartItem {
  const record = asRecord(input);
  const id = requiredId(record.id, "cart item");
  const quantity = asNumber(record.quantity) ?? asNumber(record.qty) ?? 1;

  const product = asRecord(record.product);
  const currency = asString(record.currency)
    ?? asString(product.currency)
    ?? "EUR";

  const unitPrice = toAmount(
    record.unitPrice
      ?? record.price
      ?? record.unitAmount
      ?? product.price,
    currency,
  );
  const totalPrice = toAmount(
    record.totalPrice
      ?? record.total
      ?? record.totalAmount,
    currency,
  );

  return {
    id,
    ...(typeof record.cartId === "string" ? { cartId: record.cartId } : {}),
    ...(typeof record.productId === "string" || typeof record.productId === "number"
      ? { productId: `${record.productId}` }
      : typeof product.id === "string" || typeof product.id === "number"
        ? { productId: `${product.id}` }
        : {}),
    ...(typeof record.sku === "string"
      ? { sku: record.sku }
      : typeof product.sku === "string"
        ? { sku: product.sku }
        : {}),
    ...(typeof record.title === "string"
      ? { title: record.title }
      : typeof record.name === "string"
        ? { title: record.name }
        : typeof product.title === "string"
          ? { title: product.title }
          : {}),
    quantity: quantity > 0 ? Math.floor(quantity) : 1,
    ...(unitPrice.value > 0 ? { unitPrice } : {}),
    ...(totalPrice.value > 0 ? { totalPrice } : {}),
    ...(typeof record.imageUrl === "string"
      ? { imageUrl: record.imageUrl }
      : typeof product.coverImage === "string"
        ? { imageUrl: product.coverImage }
        : {}),
    raw: input,
  };
}

export function normalizeCommerceShippingMethod(input: unknown): CommerceShippingMethod {
  const record = asRecord(input);
  return {
    id: requiredId(record.id ?? record.code ?? record.name, "shipping method"),
    name: asString(record.name) ?? asString(record.label) ?? "Unknown shipping method",
    raw: input,
  };
}

export function normalizeCommercePaymentMethod(input: unknown): CommercePaymentMethod {
  const record = asRecord(input);
  const id = asNumber(record.id);
  if (typeof id !== "number") {
    throw new CommerceNormalizationError("Unable to normalize payment method id.", {
      details: {
        id: record.id,
      },
    });
  }

  return {
    id,
    gateway: asString(record.gateway) ?? "unknown",
    method: asString(record.method) ?? "unknown",
    label: asString(record.label) ?? asString(record.method) ?? "Payment",
    ...(typeof record.icon === "string" ? { icon: record.icon } : {}),
    isEnabled: asBoolean(record.isEnabled, true),
    ...(record.minimumAmount ? { minimumAmount: toAmount(record.minimumAmount, "EUR") } : {}),
    ...(record.maximumAmount ? { maximumAmount: toAmount(record.maximumAmount, "EUR") } : {}),
    raw: input,
  };
}

export function normalizeCommerceOrder(input: unknown): CommerceOrder {
  const record = asRecord(input);
  const id = requiredId(record.id, "order");
  const subtotalAmount = toAmount(record.subtotalAmount, "EUR");
  const shippingTotals = asRecord(record.shipping);
  const shippingAmount = toAmount(shippingTotals.totalAmount ?? shippingTotals.shippingAmount, subtotalAmount.currency);

  return {
    id,
    status: asString(record.status) ?? "unknown",
    ...(typeof record.number === "string" ? { number: record.number } : {}),
    ...(typeof record.customerId === "number" ? { customerId: record.customerId } : {}),
    ...(typeof record.cartId === "string" || record.cartId === null
      ? { cartId: record.cartId as string | null }
      : {}),
    ...(typeof record.channelId === "number" ? { channelId: record.channelId } : {}),
    ...(typeof record.languageId === "number" || record.languageId === null
      ? { languageId: record.languageId as number | null }
      : {}),
    ...(typeof record.companyName === "string" ? { companyName: record.companyName } : {}),
    ...(typeof record.companyVat === "string" ? { companyVat: record.companyVat } : {}),
    ...(typeof record.shippingMethodId === "number" || record.shippingMethodId === null
      ? { shippingMethodId: record.shippingMethodId as number | null }
      : {}),
    ...(typeof record.notes === "string" ? { notes: record.notes } : {}),
    subtotalAmount,
    shippingAmount,
    discountAmount: toAmount(record.discountAmount, subtotalAmount.currency),
    taxAmount: toAmount(record.vatAmount ?? record.taxAmount, subtotalAmount.currency),
    totalAmount: toAmount(record.totalAmount, subtotalAmount.currency),
    promotionCodes: Array.isArray(record.promotionCodes)
      ? record.promotionCodes.filter((entry): entry is string => typeof entry === "string")
      : [],
    ...(toAddress(record.billingAddress) ? { billingAddress: toAddress(record.billingAddress)! } : {}),
    ...(toAddress(record.shippingAddress) ? { shippingAddress: toAddress(record.shippingAddress)! } : {}),
    ...(typeof record.createdAt === "string" ? { createdAt: record.createdAt } : {}),
    ...(typeof record.updatedAt === "string" ? { updatedAt: record.updatedAt } : {}),
    raw: input,
  };
}

export function normalizeCommercePayment(input: unknown): CommercePayment {
  const record = asRecord(input);
  return {
    id: requiredId(record.id, "payment"),
    status: asString(record.status) ?? "unknown",
    ...(typeof record.type === "string" ? { type: record.type } : {}),
    ...(typeof record.paymentmethodId === "number" ? { paymentMethodId: record.paymentmethodId } : {}),
    ...(typeof record.customerId === "number" ? { customerId: record.customerId } : {}),
    ...(typeof record.invoiceId === "number" || record.invoiceId === null
      ? { invoiceId: record.invoiceId as number | null }
      : {}),
    ...(typeof record.description === "string" ? { description: record.description } : {}),
    amount: toAmount(record.amount, "EUR"),
    ...(typeof record.expiresAt === "string" || record.expiresAt === null
      ? { expiresAt: record.expiresAt as string | null }
      : {}),
    ...(typeof record.completedAt === "string" || record.completedAt === null
      ? { completedAt: record.completedAt as string | null }
      : {}),
    ...(typeof record.createdAt === "string" ? { createdAt: record.createdAt } : {}),
    ...(typeof record.updatedAt === "string" ? { updatedAt: record.updatedAt } : {}),
    raw: input,
  };
}

export function normalizeCommerceProduct(input: unknown): CommerceProduct {
  const record = asRecord(input);
  return {
    id: requiredId(record.id, "product"),
    ...(typeof record.sku === "string" ? { sku: record.sku } : {}),
    ...(typeof record.title === "string" ? { title: record.title } : {}),
    ...(typeof record.coverImage === "string" ? { coverImage: record.coverImage } : {}),
    ...(typeof record.shortDescription === "string" ? { shortDescription: record.shortDescription } : {}),
    ...(typeof record.description === "string" ? { description: record.description } : {}),
    ...(typeof record.stock === "number" ? { stock: record.stock } : {}),
    routeByLocale: isRecord(record.routes) ? record.routes : {},
    raw: input,
  };
}

export function normalizeCommerceCartList(input: unknown): ReadonlyArray<CommerceCart> {
  return readList(input).map((entry) => normalizeCommerceCart(entry));
}

export function normalizeCommerceCartItemList(input: unknown): ReadonlyArray<CommerceCartItem> {
  return readList(input).map((entry) => normalizeCommerceCartItem(entry));
}

export function normalizeCommerceShippingMethodList(input: unknown): ReadonlyArray<CommerceShippingMethod> {
  return readList(input).map((entry) => normalizeCommerceShippingMethod(entry));
}

export function normalizeCommercePaymentMethodList(input: unknown): ReadonlyArray<CommercePaymentMethod> {
  return readList(input).map((entry) => normalizeCommercePaymentMethod(entry));
}

export function normalizeCommercePaymentList(input: unknown): ReadonlyArray<CommercePayment> {
  return readList(input).map((entry) => normalizeCommercePayment(entry));
}
