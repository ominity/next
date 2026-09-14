import { customerAccountsErrorFromResponse, CustomerAccountsError } from "./errors.js";
import type {
  CreateCustomerInvitationInput,
  CustomerAccountContext,
  CustomerAccountsClient,
  CustomerAccountsClientOptions,
  CustomerAccountsRequestOptions,
  CustomerInvitationListOptions,
  CustomerMemberListOptions,
  CustomerRoleListOptions,
  Address,
  Customer,
  CustomerGroup,
  CustomerUser,
  CustomerUserInvitation,
  CustomerUserPermissionCatalog,
  CustomerUserRole,
  Invoice,
  Mandate,
  Order,
  Payment,
  Product,
  Subscription,
  UpdateCustomerMemberRoleInput,
} from "./types.js";
import type { Paginated } from "@ominity/api-typescript/models";

const DEFAULT_BASE_PATH = "/api/customer-accounts";

function normalizeBasePath(value: string | undefined): string {
  const path = (value ?? DEFAULT_BASE_PATH).trim();
  if (!path.startsWith("/")) {
    throw new CustomerAccountsError(
      "Customer accounts basePath must start with a slash.",
      400,
      "INVALID_BASE_PATH",
    );
  }

  return path.length > 1 ? path.replace(/\/+$/, "") : "";
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CustomerAccountsError(`${name} must be a positive integer.`, 400, "INVALID_INPUT", {
      field: name,
    });
  }

  return value;
}

function optionalPositiveInteger(
  value: number | undefined,
  name: string,
): number | undefined {
  return typeof value === "undefined" ? undefined : positiveInteger(value, name);
}

function invitationToken(value: string): string {
  const token = value.trim();
  if (token.length !== 64) {
    throw new CustomerAccountsError(
      "Invitation token must contain 64 characters.",
      400,
      "INVALID_INVITATION_TOKEN",
    );
  }
  return token;
}

function queryString(input: Readonly<Record<string, string | number | undefined>>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "undefined") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query.length > 0 ? `?${query}` : "";
}

function appendQueryValue(params: URLSearchParams, key: string, value: unknown): void {
  if (typeof value === "undefined") return;
  if (value === null) {
    params.append(key, "");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) appendQueryValue(params, key, item);
    return;
  }
  if (typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      appendQueryValue(params, `${key}[${childKey}]`, childValue);
    }
    return;
  }
  params.append(key, String(value));
}

function resourceQueryString(input: Readonly<Record<string, unknown>> | undefined): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input ?? {})) {
    appendQueryValue(params, key, value);
  }
  const query = params.toString();
  return query.length > 0 ? `?${query}` : "";
}

async function responsePayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function createCustomerAccountsClient(
  options: CustomerAccountsClientOptions = {},
): CustomerAccountsClient {
  const basePath = normalizeBasePath(options.basePath);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new CustomerAccountsError(
      "A fetch implementation is required.",
      500,
      "FETCH_UNAVAILABLE",
    );
  }

  const request = async <T>(
    path: string,
    init: RequestInit = {},
    requestOptions: CustomerAccountsRequestOptions = {},
  ): Promise<T> => {
    const headers = new Headers(requestOptions.headers);
    for (const [key, value] of new Headers(init.headers)) {
      headers.set(key, value);
    }
    if (typeof init.body !== "undefined" && init.body !== null) {
      headers.set("Content-Type", "application/json");
    }
    headers.set("Accept", "application/json");

    let response: Response;
    try {
      response = await fetchImpl(`${basePath}${path}`, {
        ...init,
        headers,
        ...(requestOptions.signal ? { signal: requestOptions.signal } : {}),
        cache: "no-store",
        credentials: "same-origin",
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new CustomerAccountsError(
        "The request could not reach the application.",
        0,
        "NETWORK_ERROR",
      );
    }
    const payload = await responsePayload(response);
    if (!response.ok) {
      throw customerAccountsErrorFromResponse(response, payload);
    }

    return payload as T;
  };

  const requestBytes = async (
    path: string,
    requestOptions: CustomerAccountsRequestOptions = {},
  ): Promise<Uint8Array> => {
    const headers = new Headers(requestOptions.headers);
    headers.set("Accept", "application/pdf");
    let response: Response;
    try {
      response = await fetchImpl(`${basePath}${path}`, {
        method: "GET",
        headers,
        ...(requestOptions.signal ? { signal: requestOptions.signal } : {}),
        cache: "no-store",
        credentials: "same-origin",
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new CustomerAccountsError(
        "The request could not reach the application.",
        0,
        "NETWORK_ERROR",
      );
    }
    if (!response.ok) {
      throw customerAccountsErrorFromResponse(response, await responsePayload(response));
    }
    return new Uint8Array(await response.arrayBuffer());
  };

  return {
    customer: {
      get(input = {}, requestOptions) {
        return request<Customer>(`/customer${resourceQueryString(input)}`, {}, requestOptions);
      },
      update(data, requestOptions) {
        return request<Customer>("/customer", {
          method: "PATCH",
          body: JSON.stringify(data),
        }, requestOptions);
      },
    },

    addresses: {
      list(input = {}, requestOptions) {
        return request<Paginated<Address>>(
          `/addresses${resourceQueryString(input)}`,
          {},
          requestOptions,
        );
      },
      get(id, requestOptions) {
        return request<Address>(`/addresses/${positiveInteger(id, "addressId")}`, {}, requestOptions);
      },
      create(data, requestOptions) {
        return request<Address>("/addresses", {
          method: "POST",
          body: JSON.stringify(data),
        }, requestOptions);
      },
      update(id, data, requestOptions) {
        return request<Address>(`/addresses/${positiveInteger(id, "addressId")}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }, requestOptions);
      },
      async remove(id, requestOptions) {
        await request<null>(`/addresses/${positiveInteger(id, "addressId")}`, {
          method: "DELETE",
        }, requestOptions);
      },
    },

    groups: {
      list(input = {}, requestOptions) {
        return request<Paginated<CustomerGroup>>(
          `/groups${resourceQueryString(input)}`,
          {},
          requestOptions,
        );
      },
      get(id, input = {}, requestOptions) {
        return request<CustomerGroup>(
          `/groups/${positiveInteger(id, "groupId")}${resourceQueryString(input)}`,
          {},
          requestOptions,
        );
      },
    },

    mandates: {
      list(input = {}, requestOptions) {
        return request<Paginated<Mandate>>(
          `/mandates${resourceQueryString(input)}`,
          {},
          requestOptions,
        );
      },
      get(id, requestOptions) {
        return request<Mandate>(`/mandates/${positiveInteger(id, "mandateId")}`, {}, requestOptions);
      },
    },

    payments: {
      list(input = {}, requestOptions) {
        return request<Paginated<Payment>>(
          `/payments${resourceQueryString(input)}`,
          {},
          requestOptions,
        );
      },
      get(id, requestOptions) {
        return request<Payment>(`/payments/${positiveInteger(id, "paymentId")}`, {}, requestOptions);
      },
      create(data, input = {}, requestOptions) {
        return request<Payment>(`/payments${resourceQueryString(input)}`, {
          method: "POST",
          body: JSON.stringify(data),
        }, requestOptions);
      },
    },

    orders: {
      list(input = {}, requestOptions) {
        return request<Paginated<Order>>(`/orders${resourceQueryString(input)}`, {}, requestOptions);
      },
      get(id, input = {}, requestOptions) {
        return request<Order>(
          `/orders/${positiveInteger(id, "orderId")}${resourceQueryString(input)}`,
          {},
          requestOptions,
        );
      },
      create(data, requestOptions) {
        return request<Order>("/orders", {
          method: "POST",
          body: JSON.stringify(data),
        }, requestOptions);
      },
    },

    invoices: {
      list(input = {}, requestOptions) {
        return request<Paginated<Invoice>>(`/invoices${resourceQueryString(input)}`, {}, requestOptions);
      },
      get(id, input = {}, requestOptions) {
        return request<Invoice>(
          `/invoices/${positiveInteger(id, "invoiceId")}${resourceQueryString(input)}`,
          {},
          requestOptions,
        );
      },
      downloadPdf(id, requestOptions) {
        return requestBytes(`/invoices/${positiveInteger(id, "invoiceId")}/pdf`, requestOptions);
      },
    },

    subscriptions: {
      list(input = {}, requestOptions) {
        return request<Paginated<Subscription>>(
          `/subscriptions${resourceQueryString(input)}`,
          {},
          requestOptions,
        );
      },
      get(id, input = {}, requestOptions) {
        return request<Subscription>(
          `/subscriptions/${positiveInteger(id, "subscriptionId")}${resourceQueryString(input)}`,
          {},
          requestOptions,
        );
      },
      async remove(id, requestOptions) {
        await request<null>(`/subscriptions/${positiveInteger(id, "subscriptionId")}`, {
          method: "DELETE",
        }, requestOptions);
      },
      listTransitionProducts(subscriptionId, input = {}, requestOptions) {
        return request<Paginated<Product>>(
          `/subscriptions/${positiveInteger(subscriptionId, "subscriptionId")}/transition-products${resourceQueryString(input)}`,
          {},
          requestOptions,
        );
      },
      getTransitionProduct(subscriptionId, productId, input = {}, requestOptions) {
        return request<Product>(
          `/subscriptions/${positiveInteger(subscriptionId, "subscriptionId")}/transition-products/${positiveInteger(productId, "productId")}${resourceQueryString(input)}`,
          {},
          requestOptions,
        );
      },
    },

    getContext(requestOptions) {
      return request<CustomerAccountContext>("", {}, requestOptions);
    },

    switchCustomer(customerId, requestOptions) {
      return request<CustomerAccountContext>("/switch", {
        method: "POST",
        body: JSON.stringify({ customerId: positiveInteger(customerId, "customerId") }),
      }, requestOptions);
    },

    listMembers(input: CustomerMemberListOptions = {}, requestOptions) {
      return request<Paginated<CustomerUser>>(`/members${queryString({
        page: optionalPositiveInteger(input.page, "page"),
        limit: optionalPositiveInteger(input.limit, "limit"),
        sort: input.sort,
        id: optionalPositiveInteger(input.id, "id"),
      })}`, {}, requestOptions);
    },

    updateMemberRole(input: UpdateCustomerMemberRoleInput, requestOptions) {
      const userId = positiveInteger(input.userId, "userId");
      return request<CustomerUser>(`/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ roleId: positiveInteger(input.roleId, "roleId") }),
      }, requestOptions);
    },

    async removeMember(userId, requestOptions) {
      await request<null>(`/members/${positiveInteger(userId, "userId")}`, {
        method: "DELETE",
      }, requestOptions);
    },

    listInvitations(input: CustomerInvitationListOptions = {}, requestOptions) {
      return request<Paginated<CustomerUserInvitation>>(`/invitations${queryString({
        page: optionalPositiveInteger(input.page, "page"),
        limit: optionalPositiveInteger(input.limit, "limit"),
        sort: input.sort,
        id: optionalPositiveInteger(input.id, "id"),
        email: input.email,
        roleId: optionalPositiveInteger(input.roleId, "roleId"),
      })}`, {}, requestOptions);
    },

    getInvitation(invitationId, requestOptions) {
      return request<CustomerUserInvitation>(
        `/invitations/${positiveInteger(invitationId, "invitationId")}`,
        {},
        requestOptions,
      );
    },

    createInvitation(input, requestOptions) {
      const email = input.email.trim().toLowerCase();
      if (!email) {
        throw new CustomerAccountsError("email is required.", 400, "INVALID_INPUT", {
          field: "email",
        });
      }
      return request<CustomerUserInvitation>("/invitations", {
        method: "POST",
        body: JSON.stringify({
          email,
          roleId: positiveInteger(input.roleId, "roleId"),
          ...(typeof input.language === "string" && input.language.trim()
            ? { language: input.language.trim() }
            : {}),
        }),
      }, requestOptions);
    },

    async revokeInvitation(invitationId, requestOptions) {
      await request<null>(
        `/invitations/${positiveInteger(invitationId, "invitationId")}`,
        { method: "DELETE" },
        requestOptions,
      );
    },

    inspectInvitation(token, requestOptions) {
      return request<CustomerUserInvitation>("/invitations/inspect", {
        method: "POST",
        body: JSON.stringify({ token: invitationToken(token) }),
      }, requestOptions);
    },

    acceptInvitation(token, requestOptions) {
      return request<CustomerUser>("/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token: invitationToken(token) }),
      }, requestOptions);
    },

    listRoles(input: CustomerRoleListOptions = {}, requestOptions) {
      return request<Paginated<CustomerUserRole>>(`/roles${queryString({
        page: optionalPositiveInteger(input.page, "page"),
        limit: optionalPositiveInteger(input.limit, "limit"),
      })}`, {}, requestOptions);
    },

    listPermissions(requestOptions) {
      return request<CustomerUserPermissionCatalog>("/permissions", {}, requestOptions);
    },
  };
}
