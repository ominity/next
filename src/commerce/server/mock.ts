import type { CurrencyAmount } from "@ominity/api-typescript/models/common/amount";
import type { Address } from "@ominity/api-typescript/models/commerce/address";
import type { Cart as CommerceCart } from "@ominity/api-typescript/models/commerce/cart";
import type { CartItem as CommerceCartItem } from "@ominity/api-typescript/models/commerce/cart-item";
import type { Order as CommerceOrder } from "@ominity/api-typescript/models/commerce/order";
import type { Payment as CommercePayment } from "@ominity/api-typescript/models/commerce/payment";

interface MockCartRecord {
  id: string;
  currency: string;
  country: string;
  promotionCodes: ReadonlyArray<string>;
  items: Map<string, CommerceCartItem>;
  createdAt: string;
  updatedAt: string;
}

interface MockOrderRecord {
  order: CommerceOrder;
  cartId: string;
}

const mockCarts = new Map<string, MockCartRecord>();
const mockOrders = new Map<string, MockOrderRecord>();
const mockPayments = new Map<string, ReadonlyArray<CommercePayment>>();

let nextOrderId = 1;

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function money(value: number, currency: string): CurrencyAmount {
  const normalized = Number.isFinite(value) ? value : 0;
  const stringValue = normalized.toFixed(2);

  return {
    value: stringValue,
    amount: stringValue,
    currency,
  };
}

function emptyAddress(country: string): Address {
  return {
    firstName: "",
    lastName: "",
    street: "",
    number: "",
    additional: "",
    postalCode: "",
    city: "",
    region: "",
    country,
  };
}

function calculateTotals(items: ReadonlyArray<CommerceCartItem>, currency: string) {
  const subtotal = items.reduce((sum, item) => {
    const value = item?.totalPrice?.value ?? item?.totalAmount?.value ?? "0";
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
  const totalQuantity = items.reduce((sum, item) => {
    const quantity = Number(item?.quantity ?? 0);
    return Number.isFinite(quantity) ? sum + quantity : sum;
  }, 0);

  return {
    totalQuantity,
    subtotalAmount: money(subtotal, currency),
    shippingAmount: money(0, currency),
    discountAmount: money(0, currency),
    taxAmount: money(0, currency),
    totalAmount: money(subtotal, currency),
  };
}

function toCart(record: MockCartRecord): CommerceCart {
  const items = Array.from(record.items.values());
  const totals = calculateTotals(items, record.currency);

  return {
    resource: "cart",
    id: record.id,
    status: "pending",
    type: "guest",
    channelId: 1,
    languageId: null,
    customerId: null,
    userId: null,
    email: "",
    companyName: "",
    companyVat: "",
    billingAddress: emptyAddress(record.country),
    shippingAddress: emptyAddress(record.country),
    subtotalAmount: totals.subtotalAmount,
    shippingAmount: totals.shippingAmount,
    discountAmount: totals.discountAmount,
    taxAmount: totals.taxAmount,
    totalAmount: totals.totalAmount,
    country: record.country,
    currency: record.currency,
    isShippingRequired: true,
    shippingMethodId: null,
    isTaxExempt: false,
    totalQuantity: totals.totalQuantity,
    promotionCodes: [...record.promotionCodes],
    updatedAt: record.updatedAt,
    createdAt: record.createdAt,
    links: {
      self: {
        href: `https://mock.ominity.local/carts/${encodeURIComponent(record.id)}`,
        type: "application/hal+json",
      },
    },
  };
}

function ensureCartRecord(cartId?: string): MockCartRecord {
  if (cartId) {
    const existing = mockCarts.get(cartId);
    if (existing) {
      return existing;
    }
  }

  const created: MockCartRecord = {
    id: createId("cart"),
    currency: "EUR",
    country: "BE",
    promotionCodes: [],
    items: new Map<string, CommerceCartItem>(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  mockCarts.set(created.id, created);
  return created;
}

function normalizePromotionCodes(input: ReadonlyArray<string>): ReadonlyArray<string> {
  const values = input
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return Array.from(new Set(values));
}

export function mockGetOrCreateCart(cartId?: string): {
  readonly cart: CommerceCart;
  readonly items: ReadonlyArray<CommerceCartItem>;
  readonly created: boolean;
} {
  const existing = cartId ? mockCarts.get(cartId) : undefined;
  const record = ensureCartRecord(cartId);

  return {
    cart: toCart(record),
    items: Array.from(record.items.values()),
    created: !existing,
  };
}

export function mockAddCartItem(input: {
  readonly cartId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly sku?: string;
  readonly title?: string;
  readonly unitPrice?: number;
  readonly currency?: string;
  readonly imageUrl?: string;
}): {
  readonly cart: CommerceCart;
  readonly items: ReadonlyArray<CommerceCartItem>;
} {
  const record = ensureCartRecord(input.cartId);
  const existing = Array.from(record.items.values()).find((entry) => {
    return String(entry.productId ?? "") === input.productId;
  });

  const quantity = Number.isFinite(input.quantity) && input.quantity > 0 ? Math.floor(input.quantity) : 1;
  const unitPrice = Number.isFinite(input.unitPrice) && input.unitPrice && input.unitPrice > 0
    ? input.unitPrice
    : 99;
  const currency = typeof input.currency === "string" && input.currency.length > 0
    ? input.currency.toUpperCase()
    : record.currency;

  if (existing) {
    const currentQuantity = Number(existing.quantity ?? 0);
    const nextQuantity = (Number.isFinite(currentQuantity) ? currentQuantity : 0) + quantity;
    const nextItem: CommerceCartItem = {
      ...existing,
      quantity: nextQuantity,
      unitAmount: money(unitPrice, currency),
      totalAmount: money(unitPrice * nextQuantity, currency),
      price: money(unitPrice, currency),
      totalPrice: money(unitPrice * nextQuantity, currency),
    };

    if (typeof existing.id === "string") {
      record.items.set(existing.id, nextItem);
    }
  } else {
    const itemId = createId("item");
    record.items.set(itemId, {
      resource: "cartitem",
      id: itemId,
      cartId: record.id,
      productId: input.productId,
      quantity,
      unitAmount: money(unitPrice, currency),
      totalAmount: money(unitPrice * quantity, currency),
      price: money(unitPrice, currency),
      totalPrice: money(unitPrice * quantity, currency),
      ...(typeof input.sku === "string" && input.sku.length > 0 ? { sku: input.sku } : {}),
      ...(typeof input.title === "string" && input.title.length > 0 ? { title: input.title } : {}),
      ...(typeof input.imageUrl === "string" && input.imageUrl.length > 0
        ? { imageUrl: input.imageUrl }
        : {}),
    });
  }

  record.updatedAt = new Date().toISOString();

  return {
    cart: toCart(record),
    items: Array.from(record.items.values()),
  };
}

export function mockUpdateCartItem(input: {
  readonly cartId: string;
  readonly itemId: string;
  readonly quantity: number;
}): {
  readonly cart: CommerceCart;
  readonly items: ReadonlyArray<CommerceCartItem>;
} {
  const record = ensureCartRecord(input.cartId);
  const current = record.items.get(input.itemId);
  if (!current) {
    return {
      cart: toCart(record),
      items: Array.from(record.items.values()),
    };
  }

  if (input.quantity <= 0) {
    record.items.delete(input.itemId);
  } else {
    const quantity = Math.floor(input.quantity);
    const unitAmount = current.unitAmount ?? current.price ?? money(0, record.currency);
    const unitValue = Number.parseFloat(String(unitAmount.value ?? unitAmount.amount ?? "0"));
    const normalizedValue = Number.isFinite(unitValue) ? unitValue : 0;

    record.items.set(input.itemId, {
      ...current,
      quantity,
      unitAmount,
      totalAmount: money(normalizedValue * quantity, unitAmount.currency),
      price: unitAmount,
      totalPrice: money(normalizedValue * quantity, unitAmount.currency),
    });
  }

  record.updatedAt = new Date().toISOString();

  return {
    cart: toCart(record),
    items: Array.from(record.items.values()),
  };
}

export function mockDeleteCartItem(input: {
  readonly cartId: string;
  readonly itemId: string;
}): {
  readonly cart: CommerceCart;
  readonly items: ReadonlyArray<CommerceCartItem>;
} {
  const record = ensureCartRecord(input.cartId);
  record.items.delete(input.itemId);
  record.updatedAt = new Date().toISOString();

  return {
    cart: toCart(record),
    items: Array.from(record.items.values()),
  };
}

export function mockUpdateCart(input: {
  readonly cartId: string;
  readonly country?: string;
  readonly promotionCodes?: ReadonlyArray<string>;
}): {
  readonly cart: CommerceCart;
  readonly items: ReadonlyArray<CommerceCartItem>;
} {
  const record = ensureCartRecord(input.cartId);

  if (typeof input.country === "string") {
    const normalizedCountry = input.country.trim().toUpperCase();
    if (normalizedCountry.length === 2) {
      record.country = normalizedCountry;
    }
  }

  if (Array.isArray(input.promotionCodes)) {
    record.promotionCodes = normalizePromotionCodes(input.promotionCodes);
  }

  record.updatedAt = new Date().toISOString();

  return {
    cart: toCart(record),
    items: Array.from(record.items.values()),
  };
}

export function mockCreateOrder(input: {
  readonly cartId: string;
  readonly orderNumberPrefix?: string;
}): CommerceOrder {
  const record = ensureCartRecord(input.cartId);
  const cart = toCart(record);
  const orderId = nextOrderId++;
  const now = new Date().toISOString();

  const order: CommerceOrder = {
    resource: "order",
    id: orderId,
    customerId: 0,
    cartId: record.id,
    channelId: 1,
    languageId: null,
    number: `${input.orderNumberPrefix ?? "ORD"}-${Date.now().toString(36).toUpperCase()}`,
    invoiceId: null,
    status: "pending",
    companyName: "",
    companyVat: "",
    billingAddress: emptyAddress(record.country),
    shippingAddress: emptyAddress(record.country),
    subtotalAmount: cart.subtotalAmount,
    shipping: {
      shippingAmount: cart.shippingAmount,
      discountAmount: cart.discountAmount,
      vatAmount: cart.taxAmount,
      totalAmount: cart.totalAmount,
    },
    discountAmount: cart.discountAmount,
    vatAmount: cart.taxAmount,
    totalAmount: cart.totalAmount,
    promotionCodes: [...(cart.promotionCodes ?? [])],
    shippingMethodId: null,
    isTaxExempt: false,
    notes: "",
    updatedAt: now,
    createdAt: now,
    links: {
      self: {
        href: `https://mock.ominity.local/orders/${orderId}`,
      },
    },
  };

  mockOrders.set(String(orderId), {
    order,
    cartId: record.id,
  });
  mockPayments.set(String(orderId), []);

  return order;
}

export function mockGetOrder(orderId: string): CommerceOrder | null {
  return mockOrders.get(orderId)?.order ?? null;
}

export function mockListOrderPayments(orderId: string): ReadonlyArray<CommercePayment> {
  return mockPayments.get(orderId) ?? [];
}

export function mockGetPayment(paymentId: string): CommercePayment | null {
  for (const payments of mockPayments.values()) {
    const matched = payments.find((entry) => String(entry.id) === paymentId);
    if (matched) {
      return matched;
    }
  }

  return null;
}
