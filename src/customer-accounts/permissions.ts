import type {
  CustomerPermissionRequirement,
  CustomerUser,
} from "./types.js";

export const CUSTOMER_PERMISSIONS = {
  customerView: "commerce.customer.view",
  customerManage: "commerce.customer.manage",
  addressesView: "commerce.addresses.view",
  addressesManage: "commerce.addresses.manage",
  usersView: "commerce.users.view",
  usersManage: "commerce.users.manage",
  ordersView: "commerce.orders.view",
  ordersPlace: "commerce.orders.place",
  invoicesView: "commerce.invoices.view",
  paymentsView: "commerce.payments.view",
  paymentsManage: "commerce.payments.manage",
  subscriptionsView: "commerce.subscriptions.view",
  subscriptionsManage: "commerce.subscriptions.manage",
  mandatesView: "commerce.mandates.view",
  mandatesManage: "commerce.mandates.manage",
} as const;

export type KnownCustomerPermission = typeof CUSTOMER_PERMISSIONS[keyof typeof CUSTOMER_PERMISSIONS];

function requirements(input: CustomerPermissionRequirement): ReadonlyArray<string> {
  return typeof input === "string" ? [input] : input;
}

export function hasCustomerPermission(
  membership: Pick<CustomerUser, "isOwner" | "permissions"> | null | undefined,
  permission: string,
): boolean {
  return membership?.isOwner === true || membership?.permissions.includes(permission) === true;
}

export function hasEveryCustomerPermission(
  membership: Pick<CustomerUser, "isOwner" | "permissions"> | null | undefined,
  required: CustomerPermissionRequirement,
): boolean {
  const list = requirements(required);
  return list.length === 0 || list.every((permission) => hasCustomerPermission(
    membership,
    permission,
  ));
}

export function hasAnyCustomerPermission(
  membership: Pick<CustomerUser, "isOwner" | "permissions"> | null | undefined,
  required: CustomerPermissionRequirement,
): boolean {
  const list = requirements(required);
  return list.length === 0 || list.some((permission) => hasCustomerPermission(
    membership,
    permission,
  ));
}

export function findCustomerMembership(
  memberships: ReadonlyArray<CustomerUser>,
  customerId: number | null | undefined,
): CustomerUser | null {
  if (!Number.isInteger(customerId) || Number(customerId) <= 0) {
    return null;
  }

  return memberships.find((membership) => membership.customerId === customerId) ?? null;
}

export function selectCustomerMembership(
  memberships: ReadonlyArray<CustomerUser>,
  preferredCustomerId?: number | null,
): CustomerUser | null {
  return findCustomerMembership(memberships, preferredCustomerId) ?? memberships[0] ?? null;
}
