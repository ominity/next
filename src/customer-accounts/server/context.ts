import type { CustomerUser } from "@ominity/api-typescript/models/commerce/customer-user";

import {
  createOminityUserAccessSdk,
  requireOminityAuthenticatedUserContext,
  type OminityAuthenticatedUserContext,
  type OminityAuthRouteHandlerConfig,
} from "../../auth/server/route-handlers.js";
import {
  asNonEmptyString,
  jsonError,
} from "../../server/route-utils.js";
import {
  clearActiveCustomerId,
  readActiveCustomerId,
  writeActiveCustomerId,
  type ActiveCustomerCookieOptions,
} from "./cookies.js";

export interface OminityCustomerContextConfig extends OminityAuthRouteHandlerConfig {
  readonly activeCustomerCookieName?: string | undefined;
  readonly activeCustomerCookieMaxAgeSeconds?: number | undefined;
}

export interface OminityAuthenticatedCustomerSdkContext {
  readonly context: OminityAuthenticatedUserContext;
  readonly sdk: ReturnType<typeof createOminityUserAccessSdk>;
}

export interface OminityActiveCustomerContext extends OminityAuthenticatedUserContext {
  readonly sdk: ReturnType<typeof createOminityUserAccessSdk>;
  readonly customerId: number;
  readonly membership: CustomerUser;
}

function errorStatus(error: unknown, seen = new Set<unknown>()): number | null {
  if (typeof error !== "object" || error === null || seen.has(error)) {
    return null;
  }

  seen.add(error);
  const record = error as {
    readonly status?: unknown;
    readonly statusCode?: unknown;
    readonly rawResponse?: unknown;
    readonly response?: unknown;
    readonly cause?: unknown;
  };
  for (const value of [record.status, record.statusCode]) {
    if (typeof value === "number" && value >= 400 && value <= 599) {
      return value;
    }
  }

  if (record.rawResponse instanceof Response) {
    return record.rawResponse.status;
  }
  if (record.response instanceof Response) {
    return record.response.status;
  }

  return errorStatus(record.cause, seen);
}

export function resolveActiveCustomerCookieOptions(
  config: OminityCustomerContextConfig,
): ActiveCustomerCookieOptions {
  const name = asNonEmptyString(config.activeCustomerCookieName);
  return {
    ...(name ? { name } : {}),
    ...(typeof config.activeCustomerCookieMaxAgeSeconds === "number"
      ? { maxAgeSeconds: config.activeCustomerCookieMaxAgeSeconds }
      : {}),
    secure: (config.nodeEnv ?? "development") === "production",
  };
}

/**
 * Resolves the selected customer from the authenticated user's memberships.
 * The cookie is a preference only: a stale or forged value is checked through
 * Ominity before it is exposed to an action.
 */
export async function resolveOminityActiveCustomerMembership(
  config: OminityCustomerContextConfig,
  auth: OminityAuthenticatedCustomerSdkContext,
): Promise<{ readonly customerId: number; readonly membership: CustomerUser } | Response> {
  const options = resolveActiveCustomerCookieOptions(config);
  const preferredCustomerId = readActiveCustomerId(auth.context.cookieStore, options);

  if (preferredCustomerId !== null) {
    try {
      const membership = await auth.sdk.users.customers.get({
        userId: auth.context.userId,
        customerId: preferredCustomerId,
        include: "customer,role",
      });
      return {
        customerId: membership.customerId,
        membership,
      };
    } catch (error) {
      const status = errorStatus(error);
      if (status !== 403 && status !== 404) {
        throw error;
      }
      clearActiveCustomerId(auth.context.cookieStore, options);
    }
  }

  const memberships = await auth.sdk.users.customers.list({
    id: auth.context.userId,
    include: "customer,role",
    page: 1,
    limit: 1,
  });
  const membership = memberships.items[0];
  if (!membership) {
    return jsonError(409, "NO_ACTIVE_CUSTOMER", "No customer account is available.");
  }

  writeActiveCustomerId(auth.context.cookieStore, membership.customerId, options);
  return {
    customerId: membership.customerId,
    membership,
  };
}

/** Resolves an authenticated user, OAuth SDK, active customer, and membership. */
export async function requireOminityActiveCustomerContext(
  config: OminityCustomerContextConfig,
  request: Request,
): Promise<OminityActiveCustomerContext | Response> {
  const context = await requireOminityAuthenticatedUserContext(config, request);
  if (context instanceof Response) {
    return context;
  }

  const sdk = createOminityUserAccessSdk(
    config,
    context.session.accessToken,
    context.language,
  );
  const active = await resolveOminityActiveCustomerMembership(config, { context, sdk });
  if (active instanceof Response) {
    return active;
  }

  return {
    ...context,
    sdk,
    customerId: active.customerId,
    membership: active.membership,
  };
}
