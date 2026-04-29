import type { OminityOptions } from "@ominity/api-typescript";

export interface CommerceAmount {
  readonly currency: string;
  readonly value: number;
}

export interface CommerceAddress {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly companyName?: string;
  readonly companyVat?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly street?: string;
  readonly houseNumber?: string;
  readonly houseNumberAddition?: string;
  readonly postalCode?: string;
  readonly city?: string;
  readonly state?: string;
  readonly country?: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface CommerceCart {
  readonly id: string;
  readonly status: string;
  readonly type: string;
  readonly channelId?: number;
  readonly customerId?: number | null;
  readonly userId?: number | null;
  readonly languageId?: string | null;
  readonly email?: string;
  readonly companyName?: string;
  readonly companyVat?: string;
  readonly country?: string;
  readonly currency: string;
  readonly shippingMethodId?: string | null;
  readonly isShippingRequired: boolean;
  readonly isTaxExempt: boolean;
  readonly promotionCodes: ReadonlyArray<string>;
  readonly totalQuantity: number;
  readonly subtotalAmount: CommerceAmount;
  readonly shippingAmount: CommerceAmount;
  readonly discountAmount: CommerceAmount;
  readonly taxAmount: CommerceAmount;
  readonly totalAmount: CommerceAmount;
  readonly billingAddress?: CommerceAddress;
  readonly shippingAddress?: CommerceAddress;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly raw: unknown;
}

export interface CommerceCartItem {
  readonly id: string;
  readonly cartId?: string;
  readonly productId?: string;
  readonly sku?: string;
  readonly title?: string;
  readonly quantity: number;
  readonly unitPrice?: CommerceAmount;
  readonly totalPrice?: CommerceAmount;
  readonly imageUrl?: string;
  readonly raw: unknown;
}

export interface CommerceShippingMethod {
  readonly id: string;
  readonly name: string;
  readonly raw: unknown;
}

export interface CommercePaymentMethod {
  readonly id: number;
  readonly gateway: string;
  readonly method: string;
  readonly label: string;
  readonly icon?: string;
  readonly isEnabled: boolean;
  readonly minimumAmount?: CommerceAmount;
  readonly maximumAmount?: CommerceAmount;
  readonly raw: unknown;
}

export interface CommerceOrder {
  readonly id: string;
  readonly status: string;
  readonly number?: string;
  readonly customerId?: number;
  readonly cartId?: string | null;
  readonly channelId?: number;
  readonly languageId?: number | null;
  readonly companyName?: string;
  readonly companyVat?: string;
  readonly shippingMethodId?: number | null;
  readonly notes?: string;
  readonly subtotalAmount: CommerceAmount;
  readonly shippingAmount: CommerceAmount;
  readonly discountAmount: CommerceAmount;
  readonly taxAmount: CommerceAmount;
  readonly totalAmount: CommerceAmount;
  readonly promotionCodes: ReadonlyArray<string>;
  readonly billingAddress?: CommerceAddress;
  readonly shippingAddress?: CommerceAddress;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly raw: unknown;
}

export interface CommercePayment {
  readonly id: string;
  readonly status: string;
  readonly type?: string;
  readonly paymentMethodId?: number;
  readonly customerId?: number;
  readonly invoiceId?: number | null;
  readonly description?: string;
  readonly amount: CommerceAmount;
  readonly expiresAt?: string | null;
  readonly completedAt?: string | null;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly raw: unknown;
}

export interface CommerceProduct {
  readonly id: string;
  readonly sku?: string;
  readonly title?: string;
  readonly coverImage?: string;
  readonly shortDescription?: string;
  readonly description?: string;
  readonly stock?: number;
  readonly routeByLocale: Readonly<Record<string, unknown>>;
  readonly raw: unknown;
}

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
  listCarts?(input?: { include?: string; filter?: Readonly<Record<string, unknown>> }): Promise<unknown>;
  createCart?(data: Readonly<Record<string, unknown>>): Promise<unknown>;
  getCart?(cartId: string, input?: { include?: string }): Promise<unknown>;
  updateCart?(cartId: string, data: Readonly<Record<string, unknown>>): Promise<unknown>;
  listCartItems?(cartId: string, input?: { include?: string }): Promise<unknown>;
  createCartItem?(cartId: string, data: Readonly<Record<string, unknown>>): Promise<unknown>;
  updateCartItem?(cartId: string, itemId: string, data: Readonly<Record<string, unknown>>): Promise<unknown>;
  deleteCartItem?(cartId: string, itemId: string): Promise<unknown>;
  getProduct?(id: string, input?: { include?: string }): Promise<unknown>;
  listShippingMethods?(input?: { include?: string }): Promise<unknown>;
  listPaymentMethods?(input?: { page?: number; limit?: number }): Promise<unknown>;
  createOrder?(data: Readonly<Record<string, unknown>>): Promise<unknown>;
  getOrder?(id: string, input?: { include?: string }): Promise<unknown>;
  listOrderPayments?(orderId: string): Promise<unknown>;
  getPayment?(id: string, input?: { include?: string }): Promise<unknown>;
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
