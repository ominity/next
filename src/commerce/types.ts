import type { OminityOptions } from "@ominity/api-typescript";
import type {
  Cart,
  CartItem,
  Order,
  Paginated,
  Payment,
  Product,
  ShippingMethod,
} from "@ominity/api-typescript/models";
import type { PaymentMethod } from "@ominity/api-typescript/models/settings/payment-method";

/**
 * Helper amount used by @ominity/next pricing utilities.
 * This is intentionally separate from SDK wire models.
 */
export interface CommerceAmount {
  readonly currency: string;
  readonly value: number;
}

export type CommerceCart = Cart;
export type CommerceCartItem = CartItem;
export type CommerceShippingMethod = ShippingMethod;
export type CommercePaymentMethod = PaymentMethod;
export type CommerceOrder = Order;
export type CommercePayment = Payment;
export type CommerceProduct = Product;

export interface CommerceClientDebugOptions {
  readonly enabled?: boolean;
  readonly logger?: CommerceClientLogger;
  readonly namespace?: string;
}

export type CommerceClientLogLevel = "debug" | "info" | "warn" | "error";

export interface CommerceClientLogEvent {
  readonly scope: string;
  readonly message: string;
  readonly level: CommerceClientLogLevel;
  readonly payload?: unknown;
}

export interface CommerceClientLogger {
  log(event: CommerceClientLogEvent): void;
}

export interface CommerceClientAdapter {
  listCarts?(input?: { include?: string; filter?: Readonly<Record<string, unknown>> }): Promise<Paginated<CommerceCart> | ReadonlyArray<CommerceCart>>;
  createCart?(data: Readonly<Record<string, unknown>>): Promise<CommerceCart>;
  getCart?(cartId: string, input?: { include?: string }): Promise<CommerceCart | null>;
  updateCart?(cartId: string, data: Readonly<Record<string, unknown>>): Promise<CommerceCart>;
  listCartItems?(cartId: string, input?: { include?: string }): Promise<Paginated<CommerceCartItem> | ReadonlyArray<CommerceCartItem>>;
  createCartItem?(cartId: string, data: Readonly<Record<string, unknown>>): Promise<CommerceCartItem>;
  updateCartItem?(cartId: string, itemId: string, data: Readonly<Record<string, unknown>>): Promise<CommerceCartItem>;
  deleteCartItem?(cartId: string, itemId: string): Promise<boolean>;
  getProduct?(id: string, input?: { include?: string }): Promise<CommerceProduct | null>;
  listShippingMethods?(input?: { include?: string }): Promise<Paginated<CommerceShippingMethod> | ReadonlyArray<CommerceShippingMethod>>;
  listPaymentMethods?(input?: { page?: number; limit?: number }): Promise<Paginated<CommercePaymentMethod> | ReadonlyArray<CommercePaymentMethod>>;
  createOrder?(data: Readonly<Record<string, unknown>>): Promise<CommerceOrder>;
  getOrder?(id: string, input?: { include?: string }): Promise<CommerceOrder | null>;
  listOrderPayments?(orderId: string): Promise<Paginated<CommercePayment> | ReadonlyArray<CommercePayment>>;
  getPayment?(id: string, input?: { include?: string }): Promise<CommercePayment | null>;
}

export interface CommerceClientOptions {
  readonly sdk: OminityOptions;
  readonly debug?: CommerceClientDebugOptions;
  readonly adapter?: CommerceClientAdapter;
}

export interface CommerceListCartsInput {
  readonly include?: string;
  readonly filter?: Readonly<Record<string, unknown>>;
}

export interface CommerceCreateCartInput {
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface CommerceGetCartInput {
  readonly cartId: string;
  readonly include?: string;
}

export interface CommerceUpdateCartInput {
  readonly cartId: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface CommerceEnsureCartInput {
  readonly cartId?: string;
  readonly include?: string;
  readonly createData?: Readonly<Record<string, unknown>>;
}

export interface CommerceListCartItemsInput {
  readonly cartId: string;
  readonly include?: string;
}

export interface CommerceCreateCartItemInput {
  readonly cartId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface CommerceUpdateCartItemInput {
  readonly cartId: string;
  readonly itemId: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface CommerceDeleteCartItemInput {
  readonly cartId: string;
  readonly itemId: string;
}

export interface CommerceGetProductInput {
  readonly id: string;
  readonly include?: string;
}

export interface CommerceListShippingMethodsInput {
  readonly include?: string;
}

export interface CommerceListPaymentMethodsInput {
  readonly page?: number;
  readonly limit?: number;
}

export interface CommerceCreateOrderInput {
  readonly data: Readonly<Record<string, unknown>>;
}

export interface CommerceGetOrderInput {
  readonly id: string;
  readonly include?: string;
}

export interface CommerceListOrderPaymentsInput {
  readonly orderId: string;
}

export interface CommerceGetPaymentInput {
  readonly id: string;
  readonly include?: string;
}

export interface CommerceClient {
  listCarts(input?: CommerceListCartsInput): Promise<ReadonlyArray<CommerceCart>>;
  createCart(input?: CommerceCreateCartInput): Promise<CommerceCart>;
  getCart(input: CommerceGetCartInput): Promise<CommerceCart | null>;
  updateCart(input: CommerceUpdateCartInput): Promise<CommerceCart>;
  ensureCart(input?: CommerceEnsureCartInput): Promise<CommerceCart>;
  listCartItems(input: CommerceListCartItemsInput): Promise<ReadonlyArray<CommerceCartItem>>;
  createCartItem(input: CommerceCreateCartItemInput): Promise<CommerceCartItem>;
  updateCartItem(input: CommerceUpdateCartItemInput): Promise<CommerceCartItem>;
  deleteCartItem(input: CommerceDeleteCartItemInput): Promise<boolean>;
  getProduct(input: CommerceGetProductInput): Promise<CommerceProduct | null>;
  listShippingMethods(input?: CommerceListShippingMethodsInput): Promise<ReadonlyArray<CommerceShippingMethod>>;
  listPaymentMethods(input?: CommerceListPaymentMethodsInput): Promise<ReadonlyArray<CommercePaymentMethod>>;
  createOrder(input: CommerceCreateOrderInput): Promise<CommerceOrder>;
  getOrder(input: CommerceGetOrderInput): Promise<CommerceOrder | null>;
  listOrderPayments(input: CommerceListOrderPaymentsInput): Promise<ReadonlyArray<CommercePayment>>;
  getPayment(input: CommerceGetPaymentInput): Promise<CommercePayment | null>;
}
