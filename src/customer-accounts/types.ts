import type {
  Address,
  Customer,
  CustomerGroup,
  Invoice,
  Mandate,
  Order,
  Paginated,
  Payment,
  Product,
  Subscription,
} from "@ominity/api-typescript/models";
import type {
  AddressInput,
  AddressUpdateInput,
  CreateCustomerOrderRequest,
  CreateCustomerPaymentRequest,
  CustomerUpdateInput,
  ListCustomerAddressesRequest,
  ListCustomerGroupsRequest,
  ListCustomerInvoicesRequest,
  ListCustomerMandatesRequest,
  ListCustomerOrdersRequest,
  ListCustomerPaymentsRequest,
  ListCustomerSubscriptionsRequest,
  ListCustomerSubscriptionTransitionProductsRequest,
} from "@ominity/api-typescript/models/operations";
import type { CustomerUser } from "@ominity/api-typescript/models/commerce/customer-user";
import type { CustomerUserInvitation } from "@ominity/api-typescript/models/commerce/customer-user-invitation";
import type {
  CustomerUserPermissionCatalog,
} from "@ominity/api-typescript/models/commerce/customer-user-permission";
import type { CustomerUserRole } from "@ominity/api-typescript/models/commerce/customer-user-role";

export type {
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
};
export type {
  AddressInput,
  AddressUpdateInput,
  CreateCustomerOrderRequest,
  CreateCustomerSubscriptionRequest,
  CreateCustomerMandateRequest,
  CreateCustomerPaymentRequest,
  CustomerUpdateInput,
  ListCustomerAddressesRequest,
  ListCustomerGroupsRequest,
  ListCustomerInvoicesRequest,
  ListCustomerMandatesRequest,
  ListCustomerOrdersRequest,
  ListCustomerPaymentsRequest,
  ListCustomerSubscriptionsRequest,
  ListCustomerSubscriptionTransitionProductsRequest,
  UpdateCustomerMandateRequest,
  UpdateCustomerOrderRequest,
  UpdateCustomerSubscriptionRequest,
} from "@ominity/api-typescript/models/operations";

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

export interface ActiveCustomerClient {
  get(
    input?: { readonly include?: string },
    options?: CustomerAccountsRequestOptions,
  ): Promise<Customer>;
  update(
    data: CustomerUpdateInput,
    options?: CustomerAccountsRequestOptions,
  ): Promise<Customer>;
}

export interface CustomerAddressesClient {
  list(
    input?: Omit<ListCustomerAddressesRequest, "customerId">,
    options?: CustomerAccountsRequestOptions,
  ): Promise<Paginated<Address>>;
  get(id: number, options?: CustomerAccountsRequestOptions): Promise<Address>;
  create(data: AddressInput, options?: CustomerAccountsRequestOptions): Promise<Address>;
  update(
    id: number,
    data: AddressUpdateInput,
    options?: CustomerAccountsRequestOptions,
  ): Promise<Address>;
  remove(id: number, options?: CustomerAccountsRequestOptions): Promise<void>;
}

export interface CustomerGroupsClient {
  list(
    input?: Omit<ListCustomerGroupsRequest, "customerId">,
    options?: CustomerAccountsRequestOptions,
  ): Promise<Paginated<CustomerGroup>>;
  get(
    id: number,
    input?: { readonly include?: string },
    options?: CustomerAccountsRequestOptions,
  ): Promise<CustomerGroup>;
}

export interface CustomerMandatesClient {
  list(
    input?: Omit<ListCustomerMandatesRequest, "customerId">,
    options?: CustomerAccountsRequestOptions,
  ): Promise<Paginated<Mandate>>;
  get(id: number, options?: CustomerAccountsRequestOptions): Promise<Mandate>;
}

export interface CustomerPaymentsClient {
  list(
    input?: Omit<ListCustomerPaymentsRequest, "customerId">,
    options?: CustomerAccountsRequestOptions,
  ): Promise<Paginated<Payment>>;
  get(id: number, options?: CustomerAccountsRequestOptions): Promise<Payment>;
  create(
    data: CreateCustomerPaymentRequest["data"],
    input?: Pick<CreateCustomerPaymentRequest, "include">,
    options?: CustomerAccountsRequestOptions,
  ): Promise<Payment>;
}

export interface CustomerOrdersClient {
  list(
    input?: Omit<ListCustomerOrdersRequest, "customerId">,
    options?: CustomerAccountsRequestOptions,
  ): Promise<Paginated<Order>>;
  get(
    id: number,
    input?: { readonly include?: string },
    options?: CustomerAccountsRequestOptions,
  ): Promise<Order>;
  create(
    data: CreateCustomerOrderRequest["data"],
    options?: CustomerAccountsRequestOptions,
  ): Promise<Order>;
}

export interface CustomerInvoicesClient {
  list(
    input?: Omit<ListCustomerInvoicesRequest, "customerId">,
    options?: CustomerAccountsRequestOptions,
  ): Promise<Paginated<Invoice>>;
  get(
    id: number,
    input?: { readonly include?: string },
    options?: CustomerAccountsRequestOptions,
  ): Promise<Invoice>;
  downloadPdf(id: number, options?: CustomerAccountsRequestOptions): Promise<Uint8Array>;
}

export interface CustomerSubscriptionsClient {
  list(
    input?: Omit<ListCustomerSubscriptionsRequest, "customerId">,
    options?: CustomerAccountsRequestOptions,
  ): Promise<Paginated<Subscription>>;
  get(
    id: number,
    input?: { readonly include?: string },
    options?: CustomerAccountsRequestOptions,
  ): Promise<Subscription>;
  remove(id: number, options?: CustomerAccountsRequestOptions): Promise<void>;
  listTransitionProducts(
    subscriptionId: number,
    input?: Omit<
      ListCustomerSubscriptionTransitionProductsRequest,
      "customerId" | "subscriptionId"
    >,
    options?: CustomerAccountsRequestOptions,
  ): Promise<Paginated<Product>>;
  getTransitionProduct(
    subscriptionId: number,
    productId: number,
    input?: { readonly include?: string },
    options?: CustomerAccountsRequestOptions,
  ): Promise<Product>;
}

export interface CustomerAccountsClient {
  /** @deprecated Use `sdk.commerce.customers` with `useOminityCustomerSdkQuery` / `useOminityCustomerSdkMutation` from `@ominity/next/sdk/react`. */
  readonly customer: ActiveCustomerClient;
  /** @deprecated Use `sdk.commerce.customerAddresses` with `useOminityCustomerSdkQuery` / `useOminityCustomerSdkMutation` from `@ominity/next/sdk/react`. */
  readonly addresses: CustomerAddressesClient;
  /** @deprecated Use `sdk.commerce.customerGroups` with `useOminityCustomerSdkQuery` / `useOminityCustomerSdkMutation` from `@ominity/next/sdk/react`. */
  readonly groups: CustomerGroupsClient;
  /** @deprecated Use `sdk.commerce.customerMandates` with `useOminityCustomerSdkQuery` / `useOminityCustomerSdkMutation` from `@ominity/next/sdk/react`. */
  readonly mandates: CustomerMandatesClient;
  /** @deprecated Use `sdk.commerce.customerPayments` with `useOminityCustomerSdkQuery` / `useOminityCustomerSdkMutation` from `@ominity/next/sdk/react`. */
  readonly payments: CustomerPaymentsClient;
  /** @deprecated Use `sdk.commerce.customerOrders` with `useOminityCustomerSdkQuery` / `useOminityCustomerSdkMutation` from `@ominity/next/sdk/react`. */
  readonly orders: CustomerOrdersClient;
  /** @deprecated Use `sdk.commerce.customerInvoices` with `useOminityCustomerSdkQuery` / `useOminityCustomerSdkMutation` from `@ominity/next/sdk/react`. */
  readonly invoices: CustomerInvoicesClient;
  /** @deprecated Use `sdk.commerce.customerSubscriptions` with `useOminityCustomerSdkQuery` / `useOminityCustomerSdkMutation` from `@ominity/next/sdk/react`. */
  readonly subscriptions: CustomerSubscriptionsClient;
  getContext(options?: CustomerAccountsRequestOptions): Promise<CustomerAccountContext>;
  switchCustomer(
    customerId: number,
    options?: CustomerAccountsRequestOptions,
  ): Promise<CustomerAccountContext>;
  /** Creates a customer account owned by the user (self-service) and makes it the active one. */
  createCustomer(
    input: CreateCustomerAccountInput,
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

/** Self-service customer account: `name` is required for a business account (the default). */
export interface CreateCustomerAccountInput {
  readonly name?: string;
  readonly type?: "business" | "private";
}

export type CustomerAccountMutation =
  | "switch"
  | "create-customer"
  | "invite"
  | "accept-invitation"
  | `member:${number}:role`
  | `member:${number}:remove`
  | `invitation:${number}:revoke`;
