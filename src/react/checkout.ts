"use client";

import type {
  CreateOrderPaymentRequest,
} from "@ominity/api-typescript/models/operations";
import type { Order, Payment, ShippingMethod } from "@ominity/api-typescript/models";
import type { PaymentMethod } from "@ominity/api-typescript/models/settings/payment-method";
import type { PaymentMethodIssuer } from "@ominity/api-typescript/models/settings/payment-method-issuer";
import { useCallback, useContext, useState } from "react";

import type { OminityActionError } from "../actions/client.js";
import { useOminityQuery } from "../actions/react.js";
import { emitCommerceEvent } from "../commerce/events.js";
import { commerceMoneyCurrency, commerceMoneyValue } from "../commerce/model-helpers.js";
import { toOminitySdkError } from "../sdk/errors.js";
import { CommerceBasePathContext, useCart, type OminityCartContextValue } from "./cart.js";
import { jsonBody, requestRoute } from "./http.js";

export type OminityPaymentInput = Pick<
  CreateOrderPaymentRequest["data"],
  "type" | "paymentmethodId" | "issuerId" | "redirectUrl" | "details" | "mandateId"
>;

export interface OminityPlaceOrderInput {
  readonly notes?: string | undefined;
  /** Extra order fields; the server only accepts the ones listed in its `checkoutFields` option. */
  readonly fields?: Readonly<Record<string, unknown>> | undefined;
}

export interface UseCheckoutResult extends OminityCartContextValue {
  /** False for carts with only digital items or services: skip the shipping step. */
  readonly shippingRequired: boolean;
  readonly shippingMethods: ReadonlyArray<ShippingMethod>;
  readonly paymentMethods: ReadonlyArray<PaymentMethod>;
  readonly methodsLoading: boolean;
  /** The order placed by `placeOrder` in this checkout. */
  readonly order: Order | null;
  readonly checkoutPending: boolean;
  readonly checkoutError: OminityActionError | null;
  selectShippingMethod(shippingMethodId: string): Promise<void>;
  issuers(paymentMethodId: number): Promise<ReadonlyArray<PaymentMethodIssuer>>;
  /** Creates the order from the cart (addresses, shipping, promotion codes) and starts a new cart. */
  placeOrder(input?: OminityPlaceOrderInput): Promise<Order>;
  /** Starts a payment; send the shopper to `payment.links.checkout.href` when it has one. */
  pay(orderId: number | string, input: OminityPaymentInput): Promise<Payment>;
  getOrder(orderId: number | string): Promise<Order>;
  listPayments(orderId: number | string): Promise<ReadonlyArray<Payment>>;
}

/**
 * Everything a checkout page needs on top of `useCart`: shipping and payment methods, placing the order and paying
 * it. Orders are only readable by the browser that placed them, or by the signed-in customer.
 */
export function useCheckout(options: { readonly loadMethods?: boolean } = {}): UseCheckoutResult {
  const cart = useCart();
  const base = useContext(CommerceBasePathContext);
  const loadMethods = options.loadMethods ?? true;
  const [order, setOrder] = useState<Order | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<OminityActionError | null>(null);
  const shippingRequired = cart.cart?.isShippingRequired ?? true;
  const shippingKey = `${cart.cart?.id ?? ""}|${cart.cart?.country ?? ""}|${cart.cart?.shippingAddress?.country ?? ""}|${cart.count}`;

  const shippingLoader = useCallback(
    async () => (cart.cart && shippingRequired
      ? (await requestRoute<{ items: ShippingMethod[] }>(`${base}/shipping-methods`)).items
      : []),
    // `shippingKey` reloads the methods when the destination or the contents change.
    [base, shippingKey, shippingRequired],
  );
  const paymentLoader = useCallback(
    async () => (await requestRoute<{ items: PaymentMethod[] }>(`${base}/payment-methods`)).items,
    [base],
  );
  const shipping = useOminityQuery(shippingLoader, { enabled: loadMethods && cart.ready });
  const payment = useOminityQuery(paymentLoader, { enabled: loadMethods });

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    setPending((count) => count + 1);
    setError(null);
    try {
      return await action();
    } catch (caught) {
      const failure = toOminitySdkError(caught);
      setError(failure);
      throw failure;
    } finally {
      setPending((count) => count - 1);
    }
  }, []);

  const orderPath = (orderId: number | string) => `${base}/orders/${encodeURIComponent(String(orderId))}`;

  return {
    ...cart,
    shippingRequired,
    shippingMethods: shipping.data ?? [],
    paymentMethods: payment.data ?? [],
    methodsLoading: shipping.loading || payment.loading,
    order,
    checkoutPending: pending > 0,
    checkoutError: error,
    selectShippingMethod: (shippingMethodId) => cart.update({ shippingMethodId }),
    issuers: (paymentMethodId) => run(async () => (
      await requestRoute<{ items: PaymentMethodIssuer[] }>(`${base}/payment-methods/${paymentMethodId}/issuers`)
    ).items),
    placeOrder: (input = {}) => run(async () => {
      const placed = (await requestRoute<{ order: Order }>(`${base}/checkout`, jsonBody({
        fields: { ...input.fields, ...(input.notes ? { notes: input.notes } : {}) },
      }))).order;
      setOrder(placed);
      cart.replace({ cart: null, items: [] });
      const currency = commerceMoneyCurrency(placed.totalAmount);
      emitCommerceEvent("checkout_completed", {
        orderId: String(placed.id),
        ...(placed.number ? { orderNumber: placed.number } : {}),
        total: commerceMoneyValue(placed.totalAmount),
        ...(currency ? { currency } : {}),
      });
      return placed;
    }),
    pay: (orderId, input) => run(async () => (
      await requestRoute<{ payment: Payment }>(`${orderPath(orderId)}/payments`, {
        ...jsonBody(input),
        headers: { "Idempotency-Key": globalThis.crypto.randomUUID() },
      })
    ).payment),
    getOrder: (orderId) => run(async () => (await requestRoute<{ order: Order }>(orderPath(orderId))).order),
    listPayments: (orderId) => run(async () => (await requestRoute<{ items: Payment[] }>(`${orderPath(orderId)}/payments`)).items),
  };
}
