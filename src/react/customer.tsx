"use client";

import type { ReactNode } from "react";

import { useOminityCustomerAccounts } from "../customer-accounts/react.js";
import type { CustomerPermissionRequirement } from "../customer-accounts/types.js";

/**
 * The customer accounts the signed-in user belongs to and the active one (SDK `CustomerUser` memberships with their
 * `customer`). Works the same for a consumer with one personal account and a business user with several.
 */
export function useCustomer() {
  const accounts = useOminityCustomerAccounts();
  return {
    ready: accounts.ready,
    loading: accounts.loading,
    error: accounts.error,
    memberships: accounts.memberships,
    membership: accounts.activeMembership,
    customer: accounts.activeMembership?.customer ?? null,
    customerId: accounts.activeCustomerId,
    switchTo: accounts.switchCustomer,
    refresh: accounts.refreshContext,
    /** Creates a customer account owned by the user (when the channel allows self-service accounts) and switches to it. */
    create: accounts.createCustomer,
    can: accounts.can,
    canAll: accounts.canAll,
    canAny: accounts.canAny,
  };
}

/**
 * Whether the active membership has the permission(s), e.g. `usePermission(CUSTOMER_PERMISSIONS.ordersPlace)`.
 * Owners have every permission. This only shapes the UI; Ominity checks every request itself.
 */
export function usePermission(required: CustomerPermissionRequirement, mode: "all" | "any" = "all"): boolean {
  const accounts = useOminityCustomerAccounts();
  return mode === "any" ? accounts.canAny(required) : accounts.canAll(required);
}

export interface CanProps {
  readonly permission: CustomerPermissionRequirement;
  readonly mode?: "all" | "any" | undefined;
  readonly fallback?: ReactNode;
  readonly children: ReactNode;
}

/** Renders `children` only when the active membership has the permission(s). */
export function Can({ permission, mode = "all", fallback = null, children }: CanProps) {
  return <>{usePermission(permission, mode) ? children : fallback}</>;
}
