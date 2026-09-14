import { Ominity, type OminityOptions } from "@ominity/api-typescript";
import type { CustomerUser } from "@ominity/api-typescript/models/commerce/customer-user";
import {
  createOminityUserAccessSdk,
  requireOminityAuthenticatedUserContext,
  type OminityAuthRouteHandlerConfig,
  type OminityAuthenticatedUserContext,
} from "../../auth/server/route-handlers.js";
import {
  asNonEmptyString,
  asObjectRecord,
  createRequestLanguageResolver,
  jsonError,
  jsonResponse,
  parseJsonBody,
  type MaybePromise,
} from "../../server/route-utils.js";
import {
  CUSTOMER_PERMISSIONS,
  hasCustomerPermission,
  selectCustomerMembership,
} from "../permissions.js";
import type { CustomerAccountContext } from "../types.js";
import {
  clearActiveCustomerId,
  readActiveCustomerId,
  writeActiveCustomerId,
} from "./cookies.js";
import {
  resolveActiveCustomerCookieOptions,
  resolveOminityActiveCustomerMembership,
} from "./context.js";
import {
  handleCustomerAccountResourceDelete,
  handleCustomerAccountResourceGet,
  handleCustomerAccountResourcePatch,
  handleCustomerAccountResourcePost,
} from "./resources.js";

const DEFAULT_BASE_PATH = "/api/customer-accounts";
const MAX_PAGE_LIMIT = 250;
const MAX_MEMBERSHIP_PAGES = 100;
const CUSTOMER_RESOURCE_ROUTES = new Set([
  "customer",
  "addresses",
  "groups",
  "mandates",
  "payments",
  "orders",
  "invoices",
  "subscriptions",
]);

export interface ResolveCustomerInvitationAcceptUrlInput {
  readonly request: Request;
  readonly customerId: number;
  readonly email: string;
}

export interface OminityCustomerAccountsRouteHandlerConfig extends OminityAuthRouteHandlerConfig {
  readonly basePath?: string;
  readonly activeCustomerCookieName?: string;
  readonly activeCustomerCookieMaxAgeSeconds?: number;
  readonly invitationAcceptPath?: string;
  readonly resolveInvitationAcceptUrl?: (
    input: ResolveCustomerInvitationAcceptUrlInput,
  ) => MaybePromise<string>;
}

export interface OminityCustomerAccountsRouteHandlers {
  readonly GET: (request: Request) => Promise<Response>;
  readonly POST: (request: Request) => Promise<Response>;
  readonly PATCH: (request: Request) => Promise<Response>;
  readonly DELETE: (request: Request) => Promise<Response>;
}

function normalizedBasePath(value: string | undefined): string {
  const path = (value ?? DEFAULT_BASE_PATH).trim();
  if (!path.startsWith("/")) {
    throw new TypeError("Customer accounts basePath must start with a slash.");
  }

  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function routeSegments(request: Request, basePath: string): ReadonlyArray<string> | null {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  if (pathname === basePath) {
    return [];
  }
  if (!pathname.startsWith(`${basePath}/`)) {
    return null;
  }

  try {
    return pathname.slice(basePath.length + 1).split("/").map(decodeURIComponent);
  } catch {
    return null;
  }
}

function noStoreJson(body: unknown, status = 200): Response {
  return jsonResponse(body, status, {
    "Cache-Control": "no-store",
  });
}

function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function invalidMutationOrigin(
  config: OminityCustomerAccountsRouteHandlerConfig,
  request: Request,
): Response | null {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return noStore(jsonError(403, "INVALID_ORIGIN", "This request must come from the same site."));
  }
  const origin = asNonEmptyString(request.headers.get("origin"));
  if (!origin) return null;
  const expected = asNonEmptyString(config.siteUrl)
    ? new URL(config.siteUrl as string).origin
    : new URL(request.url).origin;
  return origin === expected
    ? null
    : noStore(jsonError(403, "INVALID_ORIGIN", "This request must come from the same site."));
}

function errorStatus(error: unknown, depth = 0): number {
  if (depth > 4 || typeof error !== "object" || error === null) {
    return 502;
  }

  const record = error as {
    status?: unknown;
    statusCode?: unknown;
    rawResponse?: unknown;
    response?: unknown;
    cause?: unknown;
  };
  const status = typeof record.status === "number"
    ? record.status
    : typeof record.statusCode === "number"
      ? record.statusCode
      : record.rawResponse instanceof Response
        ? record.rawResponse.status
        : record.response instanceof Response
          ? record.response.status
          : undefined;
  if (typeof status === "number" && status >= 400 && status <= 599) return status;
  return errorStatus(record.cause, depth + 1);
}

function errorResponse(error: unknown, fallbackCode: string, fallbackMessage: string): Response {
  const status = errorStatus(error);
  const record = typeof error === "object" && error !== null
    ? error as { fields?: unknown }
    : null;
  const code = status === 401
    ? "UNAUTHENTICATED"
    : status === 403
      ? "FORBIDDEN"
      : status === 404
        ? "NOT_FOUND"
        : status === 409
          ? "CONFLICT"
          : status === 422
            ? "VALIDATION_FAILED"
            : status === 429
              ? "RATE_LIMITED"
              : fallbackCode;

  return noStore(jsonError(
    status,
    code,
    fallbackMessage,
    typeof record?.fields === "object" && record.fields !== null
      ? { fields: record.fields }
      : undefined,
  ));
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : Number.NaN;

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function pageOptions(request: Request): { page?: number; limit?: number; sort?: string } | Response {
  const search = new URL(request.url).searchParams;
  const pageValue = search.get("page");
  const limitValue = search.get("limit");
  const page = pageValue === null ? undefined : positiveInteger(pageValue);
  const limit = limitValue === null ? undefined : positiveInteger(limitValue);
  if (pageValue !== null && page === null) {
    return jsonError(400, "INVALID_PAGE", "page must be a positive integer.");
  }
  if (limitValue !== null && (typeof limit !== "number" || limit > MAX_PAGE_LIMIT)) {
    return jsonError(400, "INVALID_LIMIT", `limit must be between 1 and ${MAX_PAGE_LIMIT}.`);
  }

  const sort = asNonEmptyString(search.get("sort"));
  return {
    ...(typeof page === "number" ? { page } : {}),
    ...(typeof limit === "number" ? { limit } : {}),
    ...(sort ? { sort } : {}),
  };
}

function positiveQueryParameter(
  search: URLSearchParams,
  name: string,
): number | undefined | Response {
  const raw = search.get(name);
  if (raw === null) return undefined;

  const value = positiveInteger(raw);
  return value ?? jsonError(
    400,
    `INVALID_${name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`,
    `${name} must be a positive integer.`,
  );
}

function publicSdkOptions(
  config: OminityCustomerAccountsRouteHandlerConfig,
  language?: string,
): OminityOptions {
  const channelId = asNonEmptyString(config.channelId);
  return {
    serverURL: (config.ominityBaseUrl ?? "https://demo.ominity.com/api").replace(/\/+$/, ""),
    ...(language ? { language } : {}),
    ...(channelId ? { channelId } : {}),
    ...(config.sdkHttpClient ? { httpClient: config.sdkHttpClient } : {}),
  };
}

async function authenticated(
  config: OminityCustomerAccountsRouteHandlerConfig,
  request: Request,
): Promise<
  | {
    readonly context: OminityAuthenticatedUserContext;
    readonly sdk: ReturnType<typeof createOminityUserAccessSdk>;
  }
  | Response
> {
  const context = await requireOminityAuthenticatedUserContext(config, request);
  if (context instanceof Response) {
    return context;
  }

  return {
    context,
    sdk: createOminityUserAccessSdk(
      config,
      context.session.accessToken,
      context.language,
    ),
  };
}

async function loadCustomerContext(
  config: OminityCustomerAccountsRouteHandlerConfig,
  auth: Exclude<Awaited<ReturnType<typeof authenticated>>, Response>,
): Promise<CustomerAccountContext> {
  const memberships: CustomerUser[] = [];
  for (let page = 1; page <= MAX_MEMBERSHIP_PAGES; page += 1) {
    const response = await auth.sdk.users.customers.list({
      id: auth.context.userId,
      include: "customer,role",
      page,
      limit: MAX_PAGE_LIMIT,
    });
    memberships.push(...response.items);
    if (!response.hasNext || response.items.length === 0) break;
    if (page === MAX_MEMBERSHIP_PAGES) {
      throw new Error("Customer membership pagination limit exceeded.");
    }
  }
  const options = resolveActiveCustomerCookieOptions(config);
  const preferredId = readActiveCustomerId(auth.context.cookieStore, options);
  const activeMembership = selectCustomerMembership(memberships, preferredId);

  if (activeMembership) {
    if (preferredId !== activeMembership.customerId) {
      writeActiveCustomerId(auth.context.cookieStore, activeMembership.customerId, options);
    }
  } else if (preferredId !== null) {
    clearActiveCustomerId(auth.context.cookieStore, options);
  }

  return {
    memberships,
    activeCustomerId: activeMembership?.customerId ?? null,
    activeMembership,
  };
}

async function requireActiveCustomer(
  config: OminityCustomerAccountsRouteHandlerConfig,
  auth: Exclude<Awaited<ReturnType<typeof authenticated>>, Response>,
  permission?: string,
): Promise<number | Response> {
  const active = await resolveOminityActiveCustomerMembership(config, auth);
  if (active instanceof Response) return active;
  if (
    permission
    && !active.membership.isOwner
    && !hasCustomerPermission(active.membership, permission)
  ) {
    return noStore(jsonError(
      403,
      "MISSING_CUSTOMER_PERMISSION",
      "You do not have permission to perform this customer action.",
    ));
  }
  return active.customerId;
}

async function requestRecord(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const record = asObjectRecord(await parseJsonBody(request));
    return record ?? jsonError(400, "INVALID_PAYLOAD", "Request body must be an object.");
  } catch {
    return jsonError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

async function invitationAcceptUrl(
  config: OminityCustomerAccountsRouteHandlerConfig,
  input: ResolveCustomerInvitationAcceptUrlInput,
): Promise<string> {
  if (config.resolveInvitationAcceptUrl) {
    return config.resolveInvitationAcceptUrl(input);
  }

  const origin = asNonEmptyString(config.siteUrl)?.replace(/\/+$/, "")
    ?? new URL(input.request.url).origin;
  const configuredPath = asNonEmptyString(config.invitationAcceptPath)
    ?? "/account/invitations/{token}";
  const marker = "__OMINITY_INVITATION_TOKEN__";

  return new URL(configuredPath.replaceAll("{token}", marker), `${origin}/`)
    .toString()
    .replaceAll(marker, "{token}");
}

export function createOminityCustomerAccountsRouteHandlers(
  config: OminityCustomerAccountsRouteHandlerConfig,
): OminityCustomerAccountsRouteHandlers {
  const basePath = normalizedBasePath(config.basePath);
  const getLanguage = createRequestLanguageResolver(config.resolveLanguage);

  const GET = async (request: Request): Promise<Response> => {
    const segments = routeSegments(request, basePath);
    if (segments === null) {
      return jsonError(404, "NOT_FOUND", "Customer account route not found.");
    }

    const auth = await authenticated(config, request);
    if (auth instanceof Response) {
      return auth;
    }

    try {
      if (segments.length === 0) {
        return noStoreJson(await loadCustomerContext(config, auth));
      }

      if (segments[0] && CUSTOMER_RESOURCE_ROUTES.has(segments[0])) {
        const active = await resolveOminityActiveCustomerMembership(config, auth);
        if (active instanceof Response) return active;
        return await handleCustomerAccountResourceGet({
          request,
          segments,
          sdk: auth.sdk,
          customerId: active.customerId,
          membership: active.membership,
        }) ?? jsonError(404, "NOT_FOUND", "Customer account route not found.");
      }

      if (segments.length === 1 && segments[0] === "members") {
        const customerId = await requireActiveCustomer(
          config,
          auth,
          CUSTOMER_PERMISSIONS.usersView,
        );
        if (customerId instanceof Response) {
          return customerId;
        }
        const options = pageOptions(request);
        if (options instanceof Response) {
          return options;
        }
        const search = new URL(request.url).searchParams;
        const id = positiveQueryParameter(search, "id");
        if (id instanceof Response) return id;
        return noStoreJson(await auth.sdk.commerce.customerUsers.list({
          customerId,
          ...options,
          ...(id ? { filter: { id } } : {}),
        }));
      }

      if (segments[0] === "invitations") {
        const customerId = await requireActiveCustomer(
          config,
          auth,
          CUSTOMER_PERMISSIONS.usersView,
        );
        if (customerId instanceof Response) {
          return customerId;
        }
        if (segments.length === 1) {
          const options = pageOptions(request);
          if (options instanceof Response) {
            return options;
          }
          const search = new URL(request.url).searchParams;
          const id = positiveQueryParameter(search, "id");
          if (id instanceof Response) return id;
          const role = positiveQueryParameter(search, "roleId");
          if (role instanceof Response) return role;
          const email = asNonEmptyString(search.get("email"));
          return noStoreJson(await auth.sdk.commerce.customerUserInvitations.list({
            customerId,
            ...options,
            ...((id || role || email) ? {
              filter: {
                ...(id ? { id } : {}),
                ...(role ? { role } : {}),
                ...(email ? { email } : {}),
              },
            } : {}),
          }));
        }

        if (segments.length === 2) {
          const invitationId = positiveInteger(segments[1]);
          if (!invitationId) {
            return jsonError(400, "INVALID_INVITATION_ID", "Invitation id must be a positive integer.");
          }
          return noStoreJson(await auth.sdk.commerce.customerUserInvitations.get({
            customerId,
            id: invitationId,
          }));
        }
      }

      if (segments.length === 1 && segments[0] === "roles") {
        const customerId = await requireActiveCustomer(
          config,
          auth,
          CUSTOMER_PERMISSIONS.usersView,
        );
        if (customerId instanceof Response) return customerId;
        const options = pageOptions(request);
        if (options instanceof Response) {
          return options;
        }
        return noStoreJson(await auth.sdk.commerce.customerUserRoles.list({
          page: options.page ?? 1,
          limit: options.limit ?? MAX_PAGE_LIMIT,
        }));
      }

      if (segments.length === 1 && segments[0] === "permissions") {
        const customerId = await requireActiveCustomer(
          config,
          auth,
          CUSTOMER_PERMISSIONS.usersView,
        );
        if (customerId instanceof Response) return customerId;
        return noStoreJson(await auth.sdk.commerce.customerUserPermissions.list());
      }

      return jsonError(404, "NOT_FOUND", "Customer account route not found.");
    } catch (error) {
      return errorResponse(error, "CUSTOMER_ACCOUNT_READ_FAILED", "Could not load customer account data.");
    }
  };

  const POST = async (request: Request): Promise<Response> => {
    const segments = routeSegments(request, basePath);
    if (segments === null) {
      return jsonError(404, "NOT_FOUND", "Customer account route not found.");
    }
    const originError = invalidMutationOrigin(config, request);
    if (originError) return originError;

    if (segments.length === 2 && segments[0] === "invitations" && segments[1] === "inspect") {
      const record = await requestRecord(request);
      if (record instanceof Response) {
        return record;
      }
      const token = asNonEmptyString(record.token);
      if (!token || token.length !== 64) {
        return jsonError(400, "INVALID_INVITATION_TOKEN", "Invitation token must contain 64 characters.");
      }

      try {
        const language = await getLanguage(request);
        const sdk = new Ominity(publicSdkOptions(config, language));
        return noStoreJson(await sdk.commerce.customerUserInvitations.inspect({ token }));
      } catch (error) {
        return errorResponse(error, "INVITATION_INSPECTION_FAILED", "Could not inspect this invitation.");
      }
    }

    const auth = await authenticated(config, request);
    if (auth instanceof Response) {
      return auth;
    }

    try {
      if (segments[0] && CUSTOMER_RESOURCE_ROUTES.has(segments[0])) {
        const active = await resolveOminityActiveCustomerMembership(config, auth);
        if (active instanceof Response) return active;
        return await handleCustomerAccountResourcePost({
          request,
          segments,
          sdk: auth.sdk,
          customerId: active.customerId,
          membership: active.membership,
        }) ?? jsonError(404, "NOT_FOUND", "Customer account route not found.");
      }

      if (segments.length === 1 && segments[0] === "switch") {
        const record = await requestRecord(request);
        if (record instanceof Response) {
          return record;
        }
        const customerId = positiveInteger(record.customerId);
        if (!customerId) {
          return jsonError(400, "INVALID_CUSTOMER_ID", "customerId must be a positive integer.");
        }

        await auth.sdk.users.customers.get({
          userId: auth.context.userId,
          customerId,
          include: "customer,role",
        });
        writeActiveCustomerId(
          auth.context.cookieStore,
          customerId,
          resolveActiveCustomerCookieOptions(config),
        );
        return noStoreJson(await loadCustomerContext(config, auth));
      }

      if (segments.length === 1 && segments[0] === "invitations") {
        const customerId = await requireActiveCustomer(
          config,
          auth,
          CUSTOMER_PERMISSIONS.usersManage,
        );
        if (customerId instanceof Response) {
          return customerId;
        }
        const record = await requestRecord(request);
        if (record instanceof Response) {
          return record;
        }
        const email = asNonEmptyString(record.email)?.toLowerCase();
        const roleId = positiveInteger(record.roleId);
        if (!email || !roleId) {
          return jsonError(400, "INVALID_INVITATION", "email and roleId are required.");
        }

        const language = asNonEmptyString(record.language) ?? auth.context.language;
        const acceptUrl = await invitationAcceptUrl(config, { request, customerId, email });
        const invitation = await auth.sdk.commerce.customerUserInvitations.create({
          customerId,
          data: {
            email,
            roleId,
            acceptUrl,
            ...(language ? { language } : {}),
          },
        });
        return noStoreJson(invitation, 201);
      }

      if (segments.length === 2 && segments[0] === "invitations" && segments[1] === "accept") {
        const record = await requestRecord(request);
        if (record instanceof Response) {
          return record;
        }
        const token = asNonEmptyString(record.token);
        if (!token || token.length !== 64) {
          return jsonError(400, "INVALID_INVITATION_TOKEN", "Invitation token must contain 64 characters.");
        }

        const membership = await auth.sdk.commerce.customerUserInvitations.accept({ token });
        writeActiveCustomerId(
          auth.context.cookieStore,
          membership.customerId,
          resolveActiveCustomerCookieOptions(config),
        );
        return noStoreJson(membership, 201);
      }

      return jsonError(404, "NOT_FOUND", "Customer account route not found.");
    } catch (error) {
      return errorResponse(error, "CUSTOMER_ACCOUNT_MUTATION_FAILED", "Customer account operation failed.");
    }
  };

  const PATCH = async (request: Request): Promise<Response> => {
    const segments = routeSegments(request, basePath);
    if (!segments) {
      return jsonError(404, "NOT_FOUND", "Customer account route not found.");
    }
    const originError = invalidMutationOrigin(config, request);
    if (originError) return originError;

    if (segments[0] && CUSTOMER_RESOURCE_ROUTES.has(segments[0])) {
      const auth = await authenticated(config, request);
      if (auth instanceof Response) return auth;
      try {
        const active = await resolveOminityActiveCustomerMembership(config, auth);
        if (active instanceof Response) return active;
        return await handleCustomerAccountResourcePatch({
          request,
          segments,
          sdk: auth.sdk,
          customerId: active.customerId,
          membership: active.membership,
        }) ?? jsonError(404, "NOT_FOUND", "Customer account route not found.");
      } catch (error) {
        return errorResponse(error, "CUSTOMER_ACCOUNT_MUTATION_FAILED", "Customer account operation failed.");
      }
    }

    if (segments.length !== 2 || segments[0] !== "members") {
      return jsonError(404, "NOT_FOUND", "Customer account route not found.");
    }
    const userId = positiveInteger(segments[1]);
    if (!userId) {
      return jsonError(400, "INVALID_USER_ID", "User id must be a positive integer.");
    }

    const auth = await authenticated(config, request);
    if (auth instanceof Response) {
      return auth;
    }
    const customerId = await requireActiveCustomer(
      config,
      auth,
      CUSTOMER_PERMISSIONS.usersManage,
    );
    if (customerId instanceof Response) {
      return customerId;
    }
    const record = await requestRecord(request);
    if (record instanceof Response) {
      return record;
    }
    const roleId = positiveInteger(record.roleId);
    if (!roleId) {
      return jsonError(400, "INVALID_ROLE_ID", "roleId must be a positive integer.");
    }

    try {
      return noStoreJson(await auth.sdk.commerce.customerUsers.update({
        customerId,
        userId,
        data: { roleId },
      }));
    } catch (error) {
      return errorResponse(error, "MEMBER_UPDATE_FAILED", "Could not update this customer member.");
    }
  };

  const DELETE = async (request: Request): Promise<Response> => {
    const segments = routeSegments(request, basePath);
    if (!segments) {
      return jsonError(404, "NOT_FOUND", "Customer account route not found.");
    }
    const originError = invalidMutationOrigin(config, request);
    if (originError) return originError;

    if (segments[0] && CUSTOMER_RESOURCE_ROUTES.has(segments[0])) {
      const auth = await authenticated(config, request);
      if (auth instanceof Response) return auth;
      try {
        const active = await resolveOminityActiveCustomerMembership(config, auth);
        if (active instanceof Response) return active;
        return await handleCustomerAccountResourceDelete({
          request,
          segments,
          sdk: auth.sdk,
          customerId: active.customerId,
          membership: active.membership,
        }) ?? jsonError(404, "NOT_FOUND", "Customer account route not found.");
      } catch (error) {
        return errorResponse(error, "CUSTOMER_ACCOUNT_MUTATION_FAILED", "Customer account operation failed.");
      }
    }

    const isMember = segments?.length === 2 && segments[0] === "members";
    const isInvitation = segments?.length === 2 && segments[0] === "invitations";
    if (!isMember && !isInvitation) {
      return jsonError(404, "NOT_FOUND", "Customer account route not found.");
    }
    const resourceId = positiveInteger(segments[1]);
    if (!resourceId) {
      return jsonError(400, "INVALID_RESOURCE_ID", "Resource id must be a positive integer.");
    }

    const auth = await authenticated(config, request);
    if (auth instanceof Response) {
      return auth;
    }
    const customerId = await requireActiveCustomer(
      config,
      auth,
      CUSTOMER_PERMISSIONS.usersManage,
    );
    if (customerId instanceof Response) {
      return customerId;
    }

    try {
      if (isMember) {
        await auth.sdk.commerce.customerUsers.delete({ customerId, userId: resourceId });
      } else {
        await auth.sdk.commerce.customerUserInvitations.revoke({ customerId, id: resourceId });
      }
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      return errorResponse(
        error,
        isMember ? "MEMBER_REMOVE_FAILED" : "INVITATION_REVOKE_FAILED",
        isMember ? "Could not remove this customer member." : "Could not revoke this invitation.",
      );
    }
  };

  return { GET, POST, PATCH, DELETE };
}
