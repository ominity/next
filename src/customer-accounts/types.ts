import type { Paginated } from "@ominity/api-typescript/models";
import type { Customer } from "@ominity/api-typescript/models/commerce/customer";
import type { CustomerUser } from "@ominity/api-typescript/models/commerce/customer-user";
import type { CustomerUserInvitation } from "@ominity/api-typescript/models/commerce/customer-user-invitation";
import type {
  CustomerUserPermissionCatalog,
} from "@ominity/api-typescript/models/commerce/customer-user-permission";
import type { CustomerUserRole } from "@ominity/api-typescript/models/commerce/customer-user-role";

export type {
  Customer,
  CustomerUser,
  CustomerUserInvitation,
  CustomerUserPermissionCatalog,
  CustomerUserRole,
};

export interface CustomerAccountsRequestOptions {
  readonly signal?: AbortSignal;
  readonly headers?: HeadersInit;
}

export interface CustomerAccountContext {
  readonly memberships: ReadonlyArray<CustomerUser>;
  readonly activeCustomerId: number | null;
  readonly activeMembership: CustomerUser | null;
}

export interface CustomerAccountPaginationOptions {
  readonly page?: number;
  readonly limit?: number;
}

export interface CustomerAccountListOptions extends CustomerAccountPaginationOptions {
  readonly sort?: string;
}

export type CustomerRoleListOptions = CustomerAccountPaginationOptions;

export interface CustomerMemberListOptions extends CustomerAccountListOptions {
  readonly id?: number;
}

export interface CustomerInvitationListOptions extends CustomerAccountListOptions {
  readonly id?: number;
  readonly email?: string;
  readonly roleId?: number;
}

export interface CreateCustomerInvitationInput {
  readonly email: string;
  readonly roleId: number;
  readonly language?: string | null;
}

export interface UpdateCustomerMemberRoleInput {
  readonly userId: number;
  readonly roleId: number;
}

export interface CustomerAccountsClientOptions {
  readonly basePath?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export interface CustomerAccountsClient {
  getContext(options?: CustomerAccountsRequestOptions): Promise<CustomerAccountContext>;
  switchCustomer(
    customerId: number,
    options?: CustomerAccountsRequestOptions,
  ): Promise<CustomerAccountContext>;
  listMembers(
    input?: CustomerMemberListOptions,
    options?: CustomerAccountsRequestOptions,
  ): Promise<Paginated<CustomerUser>>;
  updateMemberRole(
    input: UpdateCustomerMemberRoleInput,
    options?: CustomerAccountsRequestOptions,
  ): Promise<CustomerUser>;
  removeMember(
    userId: number,
    options?: CustomerAccountsRequestOptions,
  ): Promise<void>;
  listInvitations(
    input?: CustomerInvitationListOptions,
    options?: CustomerAccountsRequestOptions,
  ): Promise<Paginated<CustomerUserInvitation>>;
  getInvitation(
    invitationId: number,
    options?: CustomerAccountsRequestOptions,
  ): Promise<CustomerUserInvitation>;
  createInvitation(
    input: CreateCustomerInvitationInput,
    options?: CustomerAccountsRequestOptions,
  ): Promise<CustomerUserInvitation>;
  revokeInvitation(
    invitationId: number,
    options?: CustomerAccountsRequestOptions,
  ): Promise<void>;
  inspectInvitation(
    token: string,
    options?: CustomerAccountsRequestOptions,
  ): Promise<CustomerUserInvitation>;
  acceptInvitation(
    token: string,
    options?: CustomerAccountsRequestOptions,
  ): Promise<CustomerUser>;
  listRoles(
    input?: CustomerRoleListOptions,
    options?: CustomerAccountsRequestOptions,
  ): Promise<Paginated<CustomerUserRole>>;
  listPermissions(
    options?: CustomerAccountsRequestOptions,
  ): Promise<CustomerUserPermissionCatalog>;
}

export type CustomerPermissionRequirement = string | ReadonlyArray<string>;

export interface CustomerAccountTeamSnapshot {
  readonly members: Paginated<CustomerUser> | null;
  readonly invitations: Paginated<CustomerUserInvitation> | null;
  readonly roles: Paginated<CustomerUserRole> | null;
  readonly permissionCatalog: CustomerUserPermissionCatalog | null;
}

export type CustomerAccountMutation =
  | "switch"
  | "invite"
  | "accept-invitation"
  | `member:${number}:role`
  | `member:${number}:remove`
  | `invitation:${number}:revoke`;
