import type { OminityOptions } from "@ominity/api-typescript";
import type { RequestOptions } from "@ominity/api-typescript/lib/sdks.js";
import type {
  Cart,
  CartItem,
  Order,
  Paginated,
  Payment,
  Product,
  ProductOffer,
  ShippingClass,
  ShippingMethod,
} from "@ominity/api-typescript/models";
import type { PaymentMethod } from "@ominity/api-typescript/models/settings/payment-method";
import type { PaymentMethodIssuer } from "@ominity/api-typescript/models/settings/payment-method-issuer";
import type {
  CreateOrderPaymentRequest,
  ListCartShippingMethodsResponse,
  PaymentInput,
} from "@ominity/api-typescript/models/operations";

export type {
  Cart,
  CartItem,
  Order,
  Payment,
  Product,
  ProductOffer,
  ShippingClass,
  ShippingMethod,
} from "@ominity/api-typescript/models";
export type { CurrencyAmount } from "@ominity/api-typescript/models/common/amount";
export type { PaymentMethod } from "@ominity/api-typescript/models/settings/payment-method";
export type { PaymentMethodIssuer } from "@ominity/api-typescript/models/settings/payment-method-issuer";
export type {
  ListCartShippingMethodsResponse,
  PaymentInput,
} from "@ominity/api-typescript/models/operations";
export type { RequestOptions } from "@ominity/api-typescript/lib/sdks.js";

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
  listCarts?(input?: { include?: string; filter?: Readonly<Record<string, unknown>> }): Promise<Paginated<Cart> | ReadonlyArray<Cart>>;
  createCart?(data: Readonly<Record<string, unknown>>): Promise<Cart>;
  getCart?(cartId: string, input?: { include?: string }): Promise<Cart | null>;
  updateCart?(cartId: string, data: Readonly<Record<string, unknown>>): Promise<Cart>;
  listCartItems?(cartId: string, input?: { include?: string }): Promise<Paginated<CartItem> | ReadonlyArray<CartItem>>;
  listCartShippingMethods?(cartId: string): Promise<ListCartShippingMethodsResponse>;
  createCartItem?(cartId: string, data: Readonly<Record<string, unknown>>): Promise<CartItem>;
  updateCartItem?(cartId: string, itemId: string, data: Readonly<Record<string, unknown>>): Promise<CartItem>;
  deleteCartItem?(cartId: string, itemId: string): Promise<boolean>;
  getProduct?(id: string, input?: { include?: string }): Promise<Product | null>;
  listProducts?(input?: CommerceListProductsInput): Promise<Paginated<Product> | ReadonlyArray<Product>>;
  listProductOffers?(input: CommerceListProductOffersInput): Promise<Paginated<ProductOffer> | ReadonlyArray<ProductOffer>>;
  getProductOffer?(input: CommerceGetProductOfferInput): Promise<ProductOffer | null>;
  listShippingMethods?(input?: { include?: string }): Promise<Paginated<ShippingMethod> | ReadonlyArray<ShippingMethod>>;
  getShippingMethod?(id: string, input?: { include?: string }): Promise<ShippingMethod | null>;
  listShippingClasses?(input?: CommerceListShippingClassesInput): Promise<Paginated<ShippingClass> | ReadonlyArray<ShippingClass>>;
  getShippingClass?(id: number): Promise<ShippingClass | null>;
  listPaymentMethods?(input?: { page?: number; limit?: number }): Promise<Paginated<PaymentMethod> | ReadonlyArray<PaymentMethod>>;
  getPaymentMethod?(id: number): Promise<PaymentMethod | null>;
  listPaymentMethodIssuers?(input: CommerceListPaymentMethodIssuersInput): Promise<Paginated<PaymentMethodIssuer> | ReadonlyArray<PaymentMethodIssuer>>;
  getPaymentMethodIssuer?(input: CommerceGetPaymentMethodIssuerInput): Promise<PaymentMethodIssuer | null>;
  createOrder?(data: Readonly<Record<string, unknown>>): Promise<Order>;
  getOrder?(id: string, input?: { include?: string }): Promise<Order | null>;
  listOrderPayments?(orderId: string): Promise<Paginated<Payment> | ReadonlyArray<Payment>>;
  createOrderPayment?(input: CommerceCreateOrderPaymentInput): Promise<Payment>;
  getOrderPayment?(input: CommerceGetOrderPaymentInput): Promise<Payment | null>;
  createPayment?(input: CommerceCreatePaymentInput): Promise<Payment>;
  getPayment?(id: string, input?: { include?: string }): Promise<Payment | null>;
}

export type CommerceVisitorIdResolver = () =>
  | string
  | null
  | undefined
  | Promise<string | null | undefined>;

export interface CommerceClientOptions {
  readonly sdk: OminityOptions;
  readonly debug?: CommerceClientDebugOptions;
  readonly adapter?: CommerceClientAdapter;
  readonly visitorIdResolver?: CommerceVisitorIdResolver;
  readonly visitorIdFieldName?: string;
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

export interface CommerceListCartShippingMethodsInput {
  readonly cartId: string;
}

export interface CommerceCreateCartItemInput {
  readonly cartId: string;
  readonly productId: string;
  readonly quantity: number;
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

export interface CommerceListProductsInput {
  readonly include?: string;
  readonly filter?: Readonly<Record<string, unknown>>;
  readonly sort?: string;
  readonly page?: number;
  readonly limit?: number;
}

export interface CommerceListProductOffersInput extends CommerceListProductsInput {
  readonly productId: number;
}

export interface CommerceGetProductOfferInput {
  readonly productId: number;
  readonly offerId: number;
}

export interface CommerceListShippingMethodsInput {
  readonly include?: string;
}

export interface CommerceGetShippingMethodInput {
  readonly id: string;
  readonly include?: string;
}

export type CommerceListShippingClassesInput = CommerceListProductsInput;

export interface CommerceGetShippingClassInput {
  readonly id: number;
}

export interface CommerceListPaymentMethodsInput {
  readonly page?: number;
  readonly limit?: number;
}

export interface CommerceGetPaymentMethodInput {
  readonly id: number;
}

export interface CommerceListPaymentMethodIssuersInput extends CommerceListProductsInput {
  readonly methodId: number;
}

export interface CommerceGetPaymentMethodIssuerInput {
  readonly methodId: number;
  readonly id: number;
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

export interface CommerceCreateOrderPaymentInput {
  readonly orderId: string;
  readonly data: CreateOrderPaymentRequest["data"];
  readonly requestOptions?: RequestOptions;
}

export interface CommerceGetOrderPaymentInput {
  readonly orderId: string;
  readonly id: number;
}

export interface CommerceCreatePaymentInput {
  readonly include?: string;
  readonly data: PaymentInput;
  readonly requestOptions?: RequestOptions;
}

export interface CommerceGetPaymentInput {
  readonly id: string;
  readonly include?: string;
}

export interface CommerceClient {
  listCarts(input?: CommerceListCartsInput): Promise<ReadonlyArray<Cart>>;
  createCart(input?: CommerceCreateCartInput): Promise<Cart>;
  getCart(input: CommerceGetCartInput): Promise<Cart | null>;
  updateCart(input: CommerceUpdateCartInput): Promise<Cart>;
  ensureCart(input?: CommerceEnsureCartInput): Promise<Cart>;
  listCartItems(input: CommerceListCartItemsInput): Promise<ReadonlyArray<CartItem>>;
  listCartShippingMethods(input: CommerceListCartShippingMethodsInput): Promise<ListCartShippingMethodsResponse>;
  createCartItem(input: CommerceCreateCartItemInput): Promise<CartItem>;
  updateCartItem(input: CommerceUpdateCartItemInput): Promise<CartItem>;
  deleteCartItem(input: CommerceDeleteCartItemInput): Promise<boolean>;
  getProduct(input: CommerceGetProductInput): Promise<Product | null>;
  listProducts(input?: CommerceListProductsInput): Promise<ReadonlyArray<Product>>;
  listProductOffers(input: CommerceListProductOffersInput): Promise<ReadonlyArray<ProductOffer>>;
  getProductOffer(input: CommerceGetProductOfferInput): Promise<ProductOffer | null>;
  listShippingMethods(input?: CommerceListShippingMethodsInput): Promise<ReadonlyArray<ShippingMethod>>;
  getShippingMethod(input: CommerceGetShippingMethodInput): Promise<ShippingMethod | null>;
  listShippingClasses(input?: CommerceListShippingClassesInput): Promise<ReadonlyArray<ShippingClass>>;
  getShippingClass(input: CommerceGetShippingClassInput): Promise<ShippingClass | null>;
  listPaymentMethods(input?: CommerceListPaymentMethodsInput): Promise<ReadonlyArray<PaymentMethod>>;
  getPaymentMethod(input: CommerceGetPaymentMethodInput): Promise<PaymentMethod | null>;
  listPaymentMethodIssuers(input: CommerceListPaymentMethodIssuersInput): Promise<ReadonlyArray<PaymentMethodIssuer>>;
  getPaymentMethodIssuer(input: CommerceGetPaymentMethodIssuerInput): Promise<PaymentMethodIssuer | null>;
  createOrder(input: CommerceCreateOrderInput): Promise<Order>;
  getOrder(input: CommerceGetOrderInput): Promise<Order | null>;
  listOrderPayments(input: CommerceListOrderPaymentsInput): Promise<ReadonlyArray<Payment>>;
  createOrderPayment(input: CommerceCreateOrderPaymentInput): Promise<Payment>;
  getOrderPayment(input: CommerceGetOrderPaymentInput): Promise<Payment | null>;
  createPayment(input: CommerceCreatePaymentInput): Promise<Payment>;
  getPayment(input: CommerceGetPaymentInput): Promise<Payment | null>;
}
