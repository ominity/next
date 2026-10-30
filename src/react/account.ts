"use client";

import type { Address, Invoice, Order, Subscription, SubscriptionChange } from "@ominity/api-typescript/models";
import type { AddressInput, AddressUpdateInput } from "@ominity/api-typescript/models/operations";
import { useCallback, useState } from "react";

import type { OminityActionError } from "../actions/client.js";
import { CUSTOMER_PERMISSIONS } from "../customer-accounts/permissions.js";
import { useOminityCustomerAccounts } from "../customer-accounts/react.js";
import { CustomerAccountsError } from "../customer-accounts/errors.js";
import { toOminitySdkError } from "../sdk/errors.js";
import {
  useOminityCustomerSdkPaginatedQuery,
  useOminityCustomerSdkQuery,
  useOminitySdk,
  type UseOminitySdkPaginatedQueryOptions,
} from "../sdk/react.js";

export interface UseAccountListOptions extends Omit<UseOminitySdkPaginatedQueryOptions, "key"> {
  /** API sort, e.g. `-createdAt`. */
  readonly sort?: string | undefined;
  readonly include?: string | undefined;
  readonly filter?: Readonly<Record<string, unknown>> | undefined;
}

/** Runs account mutations with shared `pending` and `error` state. */
function useMutations() {
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<OminityActionError | null>(null);
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
  return { pending: pending > 0, error, run };
}

function useActiveCustomerId(): () => number {
  const { activeCustomerId } = useOminityCustomerAccounts();
  return useCallback(() => {
    if (activeCustomerId === null) {
      throw new CustomerAccountsError("No customer account is active.", 409, "NO_ACTIVE_CUSTOMER");
    }
    return activeCustomerId;
  }, [activeCustomerId]);
}

function listRequest(options: UseAccountListOptions, page: number, limit: number) {
  return {
    page,
    limit,
    sort: options.sort ?? "-createdAt",
    ...(options.include ? { include: options.include } : {}),
    ...(options.filter ? { filter: { ...options.filter } } : {}),
  };
}

function listKey(options: UseAccountListOptions): unknown {
  return [options.sort, options.include, options.filter];
}

/** The active customer's orders (SDK `Order`), page by page. */
export function useOrders(options: UseAccountListOptions = {}) {
  const sdk = useOminitySdk();
  const customerId = useActiveCustomerId();
  const list = useOminityCustomerSdkPaginatedQuery<Order>(
    (client, { customerId: id, page, limit, signal }) =>
      client.commerce.customerOrders.list({ customerId: id, ...listRequest(options, page, limit) }, { signal }),
    { ...options, key: listKey(options), permission: CUSTOMER_PERMISSIONS.ordersView },
  );
  return {
    ...list,
    get: (id: number, include?: string) =>
      sdk.commerce.customerOrders.get({ customerId: customerId(), id, ...(include ? { include } : {}) }),
  };
}

/** The active customer's invoices (SDK `Invoice`), with PDF downloads. */
export function useInvoices(options: UseAccountListOptions = {}) {
  const sdk = useOminitySdk();
  const customerId = useActiveCustomerId();
  const { run, pending, error } = useMutations();
  const list = useOminityCustomerSdkPaginatedQuery<Invoice>(
    (client, { customerId: id, page, limit, signal }) =>
      client.commerce.customerInvoices.list({ customerId: id, ...listRequest(options, page, limit) }, { signal }),
    { ...options, key: listKey(options), permission: CUSTOMER_PERMISSIONS.invoicesView },
  );
  const downloadPdf = (id: number) => run(() => sdk.commerce.customerInvoices.downloadPdf({ customerId: customerId(), id }));

  return {
    ...list,
    pending,
    actionError: error,
    get: (id: number) => sdk.commerce.customerInvoices.get({ customerId: customerId(), id }),
    downloadPdf,
    /** Saves the invoice PDF in the browser, named after the invoice number. */
    async download(invoice: Pick<Invoice, "id" | "number">) {
      const bytes = await downloadPdf(invoice.id);
      const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: "application/pdf" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${invoice.number || `invoice-${invoice.id}`}.pdf`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
  };
}

type Timing = "immediate" | "period_end";

function useSubscriptionActions(refresh: () => Promise<unknown>) {
  const sdk = useOminitySdk();
  const customerId = useActiveCustomerId();
  const { run, pending, error } = useMutations();
  const after = <T,>(action: () => Promise<T>) => run(async () => {
    const result = await action();
    await refresh();
    return result;
  });
  const subscriptions = sdk.commerce.customerSubscriptions;

  return {
    pending,
    actionError: error,
    /** The plans the subscription can change to, each with its quote. */
    transitions: (subscriptionId: number) => run(async () =>
      (await subscriptions.listTransitions({ customerId: customerId(), subscriptionId })).items),
    /** Prices an upgrade or downgrade; confirm the returned change with `confirmChange` before `quoteExpiresAt`. */
    quoteChange: (subscriptionId: number, toOfferId: number, timing?: Timing): Promise<SubscriptionChange> => run(() =>
      subscriptions.quoteChange({ customerId: customerId(), subscriptionId, data: { toOfferId, ...(timing ? { timing } : {}) } })),
    confirmChange: (subscriptionId: number, quoteId: string): Promise<SubscriptionChange> => after(() =>
      subscriptions.confirmChange({ customerId: customerId(), subscriptionId, data: { quoteId } })),
    /** Withdraws a scheduled change, or an immediate upgrade that is not paid yet. */
    withdrawChange: (subscriptionId: number, changeId: string): Promise<void> => after(() =>
      subscriptions.cancelChange({ customerId: customerId(), subscriptionId, changeId })),
    /** Quotes the cancellation: its date, notice period and minimum term. */
    quoteCancellation: (subscriptionId: number, timing?: Timing): Promise<SubscriptionChange> => run(() =>
      subscriptions.cancel({ customerId: customerId(), subscriptionId, ...(timing ? { data: { timing } } : {}) })),
    confirmCancellation: (subscriptionId: number, quoteId: string): Promise<SubscriptionChange> => after(() =>
      subscriptions.cancel({ customerId: customerId(), subscriptionId, data: { quoteId } })),
    revokeCancellation: (subscriptionId: number): Promise<void> => after(() =>
      subscriptions.revokeCancellation({ customerId: customerId(), subscriptionId })),
    setPaused: (subscriptionId: number, paused: boolean): Promise<Subscription> => after(() =>
      subscriptions.update({ customerId: customerId(), id: subscriptionId, data: { paused } })),
  };
}

/**
 * The active customer's subscriptions (SDK `Subscription`) with plan changes (upgrade, downgrade), cancellation
 * following the cancellation policy, and pausing. Every action follows the API's quote-then-confirm flow.
 */
export function useSubscriptions(options: UseAccountListOptions = {}) {
  const list = useOminityCustomerSdkPaginatedQuery<Subscription>(
    (client, { customerId, page, limit, signal }) =>
      client.commerce.customerSubscriptions.list(
        { customerId, ...listRequest({ include: "product,interval", ...options }, page, limit) },
        { signal },
      ),
    { ...options, key: listKey(options), permission: CUSTOMER_PERMISSIONS.subscriptionsView },
  );
  return { ...list, ...useSubscriptionActions(list.refresh) };
}

/** One subscription of the active customer, with the same actions as `useSubscriptions`. */
export function useSubscription(subscriptionId: number, options: { readonly include?: string | undefined } = {}) {
  const query = useOminityCustomerSdkQuery<Subscription>(
    (client, { customerId, signal }) => client.commerce.customerSubscriptions.get(
      { customerId, id: subscriptionId, include: options.include ?? "product,interval" },
      { signal },
    ),
    { key: [subscriptionId, options.include], permission: CUSTOMER_PERMISSIONS.subscriptionsView },
  );
  return { ...query, subscription: query.data ?? null, ...useSubscriptionActions(query.refresh) };
}

/** The active customer's address book (SDK `Address`). */
export function useAddresses() {
  const sdk = useOminitySdk();
  const customerId = useActiveCustomerId();
  const { run, pending, error } = useMutations();
  const list = useOminityCustomerSdkQuery(
    (client, { customerId: id, signal }) => client.commerce.customerAddresses.list({ customerId: id, limit: 250 }, { signal }),
    { permission: CUSTOMER_PERMISSIONS.addressesView },
  );
  const after = <T,>(action: () => Promise<T>) => run(async () => {
    const result = await action();
    await list.refresh();
    return result;
  });

  return {
    addresses: (list.data?.items ?? []) as ReadonlyArray<Address>,
    loading: list.loading,
    ready: list.ready,
    error: list.error,
    refresh: list.refresh,
    pending,
    actionError: error,
    create: (data: AddressInput) => after(() => sdk.commerce.customerAddresses.create({ customerId: customerId(), data })),
    update: (id: number, data: AddressUpdateInput) => after(() =>
      sdk.commerce.customerAddresses.update({ customerId: customerId(), id, data })),
    remove: (id: number) => after(() => sdk.commerce.customerAddresses.delete({ customerId: customerId(), id })),
  };
}
