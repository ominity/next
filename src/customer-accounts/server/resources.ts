import type { RequestOptions } from "@ominity/api-typescript/lib/sdks.js";
import type { CustomerUser } from "@ominity/api-typescript/models/commerce/customer-user";
import type {
  AddressInput,
  AddressUpdateInput,
  CreateCustomerPaymentRequest,
  CustomerUpdateInput,
} from "@ominity/api-typescript/models/operations";

import { createOminityUserAccessSdk } from "../../auth/server/route-handlers.js";
import {
  asNonEmptyString,
  asObjectRecord,
  jsonError,
  jsonResponse,
  parseJsonBody,
} from "../../server/route-utils.js";
import { CUSTOMER_PERMISSIONS, hasCustomerPermission } from "../permissions.js";

const MAX_PAGE_LIMIT = 250;
const FORBIDDEN_FILTER_KEYS = new Set(["__proto__", "constructor", "prototype"]);

type UserSdk = ReturnType<typeof createOminityUserAccessSdk>;

export interface CustomerAccountResourceRequestContext {
  readonly request: Request;
  readonly segments: ReadonlyArray<string>;
  readonly sdk: UserSdk;
  readonly customerId: number;
  readonly membership: CustomerUser;
}

type ListRequest = {
  readonly include?: string;
  readonly filter?: Record<string, unknown>;
  readonly sort?: string;
  readonly page?: number;
  readonly limit?: number;
};

function noStoreJson(body: unknown, status = 200): Response {
  return jsonResponse(body, status, { "Cache-Control": "no-store" });
}

function noStoreError(status: number, code: string, message: string): Response {
  const response = jsonError(status, code, message);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function positiveInteger(value: string | undefined, field: string): number | Response {
  if (!value || !/^\d+$/.test(value)) {
    return noStoreError(400, "INVALID_RESOURCE_ID", `${field} must be a positive integer.`);
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : noStoreError(400, "INVALID_RESOURCE_ID", `${field} must be a positive integer.`);
}

function queryInteger(
  search: URLSearchParams,
  field: "page" | "limit",
): number | undefined | Response {
  const raw = search.get(field);
  if (raw === null) return undefined;
  const parsed = positiveInteger(raw, field);
  if (parsed instanceof Response) return parsed;
  if (field === "limit" && parsed > MAX_PAGE_LIMIT) {
    return noStoreError(400, "INVALID_LIMIT", `limit must be between 1 and ${MAX_PAGE_LIMIT}.`);
  }
  return parsed;
}

function filterPath(key: string): ReadonlyArray<string> | null {
  const match = /^filter\[([^\]]+)\]((?:\[[^\]]+\])*)$/.exec(key);
  if (!match?.[1]) return null;
  const path = [match[1]];
  for (const segment of (match[2] ?? "").matchAll(/\[([^\]]+)\]/g)) {
    if (segment[1]) path.push(segment[1]);
  }
  return path.length <= 6 && path.every((item) => !FORBIDDEN_FILTER_KEYS.has(item))
    ? path
    : null;
}

function assignFilterValue(target: Record<string, unknown>, path: ReadonlyArray<string>, value: string): void {
  let cursor = target;
  for (const key of path.slice(0, -1)) {
    const current = cursor[key];
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  const last = path.at(-1);
  if (!last) return;
  const current = cursor[last];
  cursor[last] = typeof current === "undefined"
    ? value
    : Array.isArray(current)
      ? [...current, value]
      : [current, value];
}

function listRequest(request: Request): ListRequest | Response {
  const search = new URL(request.url).searchParams;
  const page = queryInteger(search, "page");
  if (page instanceof Response) return page;
  const limit = queryInteger(search, "limit");
  if (limit instanceof Response) return limit;
  const filter: Record<string, unknown> = {};

  for (const [key, value] of search.entries()) {
    if (["include", "sort", "page", "limit"].includes(key)) continue;
    const path = filterPath(key);
    if (!path) {
      return noStoreError(400, "INVALID_QUERY", `Unsupported query parameter: ${key}.`);
    }
    assignFilterValue(filter, path, value);
  }

  const include = asNonEmptyString(search.get("include"));
  const sort = asNonEmptyString(search.get("sort"));
  return {
    ...(include ? { include } : {}),
    ...(sort ? { sort } : {}),
    ...(typeof page === "number" ? { page } : {}),
    ...(typeof limit === "number" ? { limit } : {}),
    ...(Object.keys(filter).length > 0 ? { filter } : {}),
  };
}

function includeRequest(request: Request): { readonly include?: string } | Response {
  const search = new URL(request.url).searchParams;
  for (const key of search.keys()) {
    if (key !== "include") {
      return noStoreError(400, "INVALID_QUERY", `Unsupported query parameter: ${key}.`);
    }
  }
  const include = asNonEmptyString(search.get("include"));
  return include ? { include } : {};
}

async function bodyRecord(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body = asObjectRecord(await parseJsonBody(request));
    return body ?? noStoreError(400, "INVALID_PAYLOAD", "Request body must be an object.");
  } catch {
    return noStoreError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

function permissionResponse(
  membership: CustomerUser,
  permission: string,
): Response | null {
  if (membership.isOwner || hasCustomerPermission(membership, permission)) return null;
  return noStoreError(
    403,
    "MISSING_CUSTOMER_PERMISSION",
    "You do not have permission to perform this customer action.",
  );
}

function requestOptions(request: Request): RequestOptions | undefined {
  const idempotencyKey = asNonEmptyString(request.headers.get("idempotency-key"));
  return idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : undefined;
}

function byteResponse(bytes: Uint8Array, invoiceId: number): Response {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${invoiceId}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function handleCustomerAccountResourceGet(
  context: CustomerAccountResourceRequestContext,
): Promise<Response | null> {
  const { request, segments, sdk, customerId, membership } = context;
  const [resource, rawId, action, rawRelatedId] = segments;

  if (segments.length === 1 && resource === "customer") {
    const denied = permissionResponse(membership, CUSTOMER_PERMISSIONS.customerView);
    if (denied) return denied;
    const input = includeRequest(request);
    return input instanceof Response
      ? input
      : noStoreJson(await sdk.commerce.customers.get({ id: customerId, ...input }));
  }

  const listPermissions: Readonly<Record<string, string>> = {
    addresses: CUSTOMER_PERMISSIONS.addressesView,
    groups: CUSTOMER_PERMISSIONS.customerView,
    mandates: CUSTOMER_PERMISSIONS.mandatesView,
    payments: CUSTOMER_PERMISSIONS.paymentsView,
    orders: CUSTOMER_PERMISSIONS.ordersView,
    invoices: CUSTOMER_PERMISSIONS.invoicesView,
    subscriptions: CUSTOMER_PERMISSIONS.subscriptionsView,
  };
  const listPermission = resource ? listPermissions[resource] : undefined;
  if (segments.length === 1 && resource && listPermission) {
    const denied = permissionResponse(membership, listPermission);
    if (denied) return denied;
    const input = listRequest(request);
    if (input instanceof Response) return input;
    if (resource === "addresses") return noStoreJson(await sdk.commerce.customerAddresses.list({ customerId, ...input }));
    if (resource === "groups") return noStoreJson(await sdk.commerce.customerGroups.list({ customerId, ...input }));
    if (resource === "mandates") return noStoreJson(await sdk.commerce.customerMandates.list({ customerId, ...input }));
    if (resource === "payments") return noStoreJson(await sdk.commerce.customerPayments.list({ customerId, ...input }));
    if (resource === "orders") return noStoreJson(await sdk.commerce.customerOrders.list({ customerId, ...input }));
    if (resource === "invoices") return noStoreJson(await sdk.commerce.customerInvoices.list({ customerId, ...input }));
    return noStoreJson(await sdk.commerce.customerSubscriptions.list({ customerId, ...input }));
  }

  if (resource === "subscriptions" && action === "transition-products") {
    const denied = permissionResponse(membership, CUSTOMER_PERMISSIONS.subscriptionsView);
    if (denied) return denied;
    const subscriptionId = positiveInteger(rawId, "subscriptionId");
    if (subscriptionId instanceof Response) return subscriptionId;
    if (segments.length === 3) {
      const input = listRequest(request);
      return input instanceof Response
        ? input
        : noStoreJson(await sdk.commerce.customerSubscriptions.listTransitionProducts({
          customerId,
          subscriptionId,
          ...input,
        }));
    }
    if (segments.length === 4) {
      const productId = positiveInteger(rawRelatedId, "productId");
      if (productId instanceof Response) return productId;
      const input = includeRequest(request);
      return input instanceof Response
        ? input
        : noStoreJson(await sdk.commerce.customerSubscriptions.getTransitionProduct({
          customerId,
          subscriptionId,
          productId,
          ...input,
        }));
    }
  }

  if (resource === "invoices" && segments.length === 3 && action === "pdf") {
    const denied = permissionResponse(membership, CUSTOMER_PERMISSIONS.invoicesView);
    if (denied) return denied;
    const id = positiveInteger(rawId, "invoiceId");
    if (id instanceof Response) return id;
    return byteResponse(await sdk.commerce.customerInvoices.downloadPdf({ customerId, id }), id);
  }

  if (segments.length !== 2 || !resource || !listPermission) return null;
  const denied = permissionResponse(membership, listPermission);
  if (denied) return denied;
  const id = positiveInteger(rawId, `${resource.replace(/s$/, "")}Id`);
  if (id instanceof Response) return id;
  const input = includeRequest(request);
  if (input instanceof Response) return input;
  if (resource === "addresses") return noStoreJson(await sdk.commerce.customerAddresses.get({ customerId, id }));
  if (resource === "groups") return noStoreJson(await sdk.commerce.customerGroups.get({ customerId, id, ...input }));
  if (resource === "mandates") return noStoreJson(await sdk.commerce.customerMandates.get({ customerId, id }));
  if (resource === "payments") return noStoreJson(await sdk.commerce.customerPayments.get({ customerId, id }));
  if (resource === "orders") return noStoreJson(await sdk.commerce.customerOrders.get({ customerId, id, ...input }));
  if (resource === "invoices") return noStoreJson(await sdk.commerce.customerInvoices.get({ customerId, id, ...input }));
  return noStoreJson(await sdk.commerce.customerSubscriptions.get({ customerId, id, ...input }));
}

export async function handleCustomerAccountResourcePost(
  context: CustomerAccountResourceRequestContext,
): Promise<Response | null> {
  const { request, segments, sdk, customerId, membership } = context;
  const [resource] = segments;

  const createPermissions: Readonly<Record<string, string>> = {
    addresses: CUSTOMER_PERMISSIONS.addressesManage,
    payments: CUSTOMER_PERMISSIONS.paymentsManage,
    orders: CUSTOMER_PERMISSIONS.ordersPlace,
  };
  const permission = resource ? createPermissions[resource] : undefined;
  if (segments.length !== 1 || !resource || !permission) return null;
  const denied = permissionResponse(membership, permission);
  if (denied) return denied;
  const data = await bodyRecord(request);
  if (data instanceof Response) return data;
  const options = requestOptions(request);

  if (resource === "addresses") return noStoreJson(await sdk.commerce.customerAddresses.create({ customerId, data: data as AddressInput }, options), 201);
  if (resource === "orders") return noStoreJson(await sdk.commerce.customerOrders.create({ customerId, data }, options), 201);

  const input = includeRequest(request);
  return input instanceof Response
    ? input
    : noStoreJson(await sdk.commerce.customerPayments.create({
      customerId,
      ...input,
      data: data as CreateCustomerPaymentRequest["data"],
    }, options), 201);
}

export async function handleCustomerAccountResourcePatch(
  context: CustomerAccountResourceRequestContext,
): Promise<Response | null> {
  const { request, segments, sdk, customerId, membership } = context;
  const [resource, rawId] = segments;

  if (segments.length === 1 && resource === "customer") {
    const denied = permissionResponse(membership, CUSTOMER_PERMISSIONS.customerManage);
    if (denied) return denied;
    const data = await bodyRecord(request);
    if (data instanceof Response) return data;
    return noStoreJson(await sdk.commerce.customers.update({ id: customerId, data: data as CustomerUpdateInput }));
  }

  const updatePermissions: Readonly<Record<string, string>> = {
    addresses: CUSTOMER_PERMISSIONS.addressesManage,
  };
  const permission = resource ? updatePermissions[resource] : undefined;
  if (segments.length !== 2 || !resource || !permission) return null;
  const denied = permissionResponse(membership, permission);
  if (denied) return denied;
  const id = positiveInteger(rawId, `${resource.replace(/s$/, "")}Id`);
  if (id instanceof Response) return id;
  const data = await bodyRecord(request);
  if (data instanceof Response) return data;

  if (resource === "addresses") return noStoreJson(await sdk.commerce.customerAddresses.update({ customerId, id, data: data as AddressUpdateInput }));
  return null;
}

export async function handleCustomerAccountResourceDelete(
  context: CustomerAccountResourceRequestContext,
): Promise<Response | null> {
  const { request, segments, sdk, customerId, membership } = context;
  const [resource, rawId] = segments;
  const deletePermissions: Readonly<Record<string, string>> = {
    addresses: CUSTOMER_PERMISSIONS.addressesManage,
    subscriptions: CUSTOMER_PERMISSIONS.subscriptionsManage,
  };
  const permission = resource ? deletePermissions[resource] : undefined;
  if (segments.length !== 2 || !resource || !permission) return null;
  const denied = permissionResponse(membership, permission);
  if (denied) return denied;
  const id = positiveInteger(rawId, `${resource.replace(/s$/, "")}Id`);
  if (id instanceof Response) return id;
  const options = requestOptions(request);

  if (resource === "addresses") await sdk.commerce.customerAddresses.delete({ customerId, id }, options);
  else await sdk.commerce.customerSubscriptions.delete({ customerId, id }, options);

  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
