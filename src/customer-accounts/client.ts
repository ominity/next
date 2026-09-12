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
  CustomerUser,
  CustomerUserInvitation,
  CustomerUserPermissionCatalog,
  CustomerUserRole,
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

    const response = await fetchImpl(`${basePath}${path}`, {
      ...init,
      headers,
      ...(requestOptions.signal ? { signal: requestOptions.signal } : {}),
      cache: "no-store",
      credentials: "same-origin",
    });
    const payload = await responsePayload(response);
    if (!response.ok) {
      throw customerAccountsErrorFromResponse(response, payload);
    }

    return payload as T;
  };

  return {
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
