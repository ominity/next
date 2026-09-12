"use client";

import type { Paginated } from "@ominity/api-typescript/models";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  useOminityAuth,
  type OminityAuthRegisterInput,
  type OminityAuthSignInInput,
  type OminityBrowserMfaMethod,
} from "../auth/react.js";
import { createCustomerAccountsClient } from "./client.js";
import { CustomerAccountsError } from "./errors.js";
import {
  hasAnyCustomerPermission,
  hasEveryCustomerPermission,
  hasCustomerPermission,
} from "./permissions.js";
import type {
  CreateCustomerInvitationInput,
  CustomerAccountContext,
  CustomerAccountMutation,
  CustomerAccountsClient,
  CustomerAccountsClientOptions,
  CustomerAccountTeamSnapshot,
  CustomerInvitationListOptions,
  CustomerMemberListOptions,
  CustomerPermissionRequirement,
  CustomerRoleListOptions,
  CustomerUser,
  CustomerUserInvitation,
  CustomerUserPermissionCatalog,
  CustomerUserRole,
  UpdateCustomerMemberRoleInput,
} from "./types.js";

const EMPTY_ACCOUNT_CONTEXT: CustomerAccountContext = {
  memberships: [],
  activeCustomerId: null,
  activeMembership: null,
};

const EMPTY_TEAM_SNAPSHOT: CustomerAccountTeamSnapshot = {
  members: null,
  invitations: null,
  roles: null,
  permissionCatalog: null,
};

export type CustomerAccountTeamResource =
  | "members"
  | "invitations"
  | "roles"
  | "permissions";

export type CustomerAccountTeamErrors = Readonly<Partial<
  Record<CustomerAccountTeamResource, CustomerAccountsError>
>>;

export type CustomerInvitationAuthenticationResult =
  | {
    readonly status: "accepted";
    readonly invitation: CustomerUserInvitation;
    readonly membership: CustomerUser;
  }
  | {
    readonly status: "requires-mfa";
    readonly invitation: CustomerUserInvitation;
    readonly methods: ReadonlyArray<OminityBrowserMfaMethod>;
  }
  | {
    readonly status: "requires-sign-in";
    readonly invitation: CustomerUserInvitation;
  };

export interface OminityCustomerAccountsProviderProps {
  readonly children: ReactNode;
  readonly client?: CustomerAccountsClient;
  readonly clientOptions?: CustomerAccountsClientOptions;
  readonly autoLoadTeam?: boolean;
  readonly teamPageSize?: number;
}

export interface OminityCustomerAccountsContextValue {
  readonly ready: boolean;
  readonly loading: boolean;
  readonly teamLoading: boolean;
  readonly error: CustomerAccountsError | null;
  readonly teamErrors: CustomerAccountTeamErrors;
  readonly memberships: ReadonlyArray<CustomerUser>;
  readonly activeCustomerId: number | null;
  readonly activeMembership: CustomerUser | null;
  readonly members: Paginated<CustomerUser> | null;
  readonly invitations: Paginated<CustomerUserInvitation> | null;
  readonly roles: Paginated<CustomerUserRole> | null;
  readonly permissionCatalog: CustomerUserPermissionCatalog | null;
  readonly inspectedInvitation: CustomerUserInvitation | null;
  readonly pendingMutations: ReadonlySet<CustomerAccountMutation>;
  can(permission: string): boolean;
  canAll(required: CustomerPermissionRequirement): boolean;
  canAny(required: CustomerPermissionRequirement): boolean;
  isMutationPending(mutation: CustomerAccountMutation): boolean;
  clearError(): void;
  refreshContext(): Promise<CustomerAccountContext>;
  switchCustomer(customerId: number): Promise<CustomerAccountContext>;
  refreshTeam(): Promise<CustomerAccountTeamSnapshot>;
  loadMembers(input?: CustomerMemberListOptions): Promise<Paginated<CustomerUser>>;
  loadInvitations(
    input?: CustomerInvitationListOptions,
  ): Promise<Paginated<CustomerUserInvitation>>;
  loadRoles(input?: CustomerRoleListOptions): Promise<Paginated<CustomerUserRole>>;
  loadPermissions(): Promise<CustomerUserPermissionCatalog>;
  createInvitation(input: CreateCustomerInvitationInput): Promise<CustomerUserInvitation>;
  updateMemberRole(input: UpdateCustomerMemberRoleInput): Promise<CustomerUser>;
  removeMember(userId: number): Promise<void>;
  revokeInvitation(invitationId: number): Promise<void>;
  inspectInvitation(token: string): Promise<CustomerUserInvitation>;
  acceptInvitation(token: string): Promise<CustomerUser>;
  signInAndAcceptInvitation(
    token: string,
    input: OminityAuthSignInInput,
  ): Promise<CustomerInvitationAuthenticationResult>;
  registerAndAcceptInvitation(
    token: string,
    input: OminityAuthRegisterInput,
  ): Promise<CustomerInvitationAuthenticationResult>;
}

const CustomerAccountsContext = createContext<OminityCustomerAccountsContextValue | null>(null);

function normalizeError(error: unknown): CustomerAccountsError {
  if (error instanceof CustomerAccountsError) {
    return error;
  }

  return new CustomerAccountsError(
    error instanceof Error ? error.message : "Customer account operation failed.",
    0,
    "CUSTOMER_ACCOUNT_OPERATION_FAILED",
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizedTeamPageSize(value: number | undefined): number {
  const size = value ?? 100;
  if (!Number.isSafeInteger(size) || size < 1 || size > 250) {
    throw new TypeError("teamPageSize must be an integer between 1 and 250.");
  }
  return size;
}

function requireMatchingInvitationEmail(
  invitation: CustomerUserInvitation,
  email: string,
): void {
  if (normalizedEmail(invitation.email) !== normalizedEmail(email)) {
    throw new CustomerAccountsError(
      "Sign in or register with the email address that received this invitation.",
      422,
      "INVITATION_EMAIL_MISMATCH",
      { email: invitation.email },
    );
  }
}

function withoutTeamError(
  errors: CustomerAccountTeamErrors,
  resource: CustomerAccountTeamResource,
): CustomerAccountTeamErrors {
  const next = { ...errors };
  delete next[resource];
  return next;
}

function replaceMember(
  page: Paginated<CustomerUser> | null,
  member: CustomerUser,
): Paginated<CustomerUser> | null {
  if (!page) return null;
  const exists = page.items.some((item) => item.userId === member.userId);
  return {
    ...page,
    items: exists
      ? page.items.map((item) => item.userId === member.userId ? member : item)
      : page.items,
  };
}

function removeMemberFromPage(
  page: Paginated<CustomerUser> | null,
  userId: number,
): Paginated<CustomerUser> | null {
  if (!page || !page.items.some((item) => item.userId === userId)) return page;
  return {
    ...page,
    items: page.items.filter((item) => item.userId !== userId),
    count: Math.max(0, page.count - 1),
  };
}

function addInvitationToPage(
  page: Paginated<CustomerUserInvitation> | null,
  invitation: CustomerUserInvitation,
): Paginated<CustomerUserInvitation> | null {
  if (!page) return null;
  const withoutInvitation = page.items.filter((item) => item.id !== invitation.id);
  return {
    ...page,
    items: [invitation, ...withoutInvitation].slice(0, page.limit),
    count: withoutInvitation.length === page.items.length ? page.count + 1 : page.count,
  };
}

function removeInvitationFromPage(
  page: Paginated<CustomerUserInvitation> | null,
  invitationId: number,
): Paginated<CustomerUserInvitation> | null {
  if (!page || !page.items.some((item) => item.id === invitationId)) return page;
  return {
    ...page,
    items: page.items.filter((item) => item.id !== invitationId),
    count: Math.max(0, page.count - 1),
  };
}

export function OminityCustomerAccountsProvider(props: OminityCustomerAccountsProviderProps) {
  const auth = useOminityAuth();
  const client = useMemo(
    () => props.client ?? createCustomerAccountsClient(props.clientOptions),
    [props.client, props.clientOptions],
  );
  const autoLoadTeam = props.autoLoadTeam ?? true;
  const teamPageSize = normalizedTeamPageSize(props.teamPageSize);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);
  const [error, setError] = useState<CustomerAccountsError | null>(null);
  const [teamErrors, setTeamErrors] = useState<CustomerAccountTeamErrors>({});
  const [accountContext, setAccountContext] = useState<CustomerAccountContext>(EMPTY_ACCOUNT_CONTEXT);
  const [team, setTeam] = useState<CustomerAccountTeamSnapshot>(EMPTY_TEAM_SNAPSHOT);
  const [inspectedInvitation, setInspectedInvitation] = useState<CustomerUserInvitation | null>(null);
  const [pendingMutations, setPendingMutations] = useState<ReadonlySet<CustomerAccountMutation>>(
    new Set(),
  );
  const mutationCounts = useRef(new Map<CustomerAccountMutation, number>());
  const contextRequest = useRef<{ revision: number; controller: AbortController } | null>(null);
  const teamRequest = useRef<{ revision: number; controller: AbortController } | null>(null);
  const nextRevision = useRef(0);
  const activeCustomerId = useRef<number | null>(null);

  const clearTeam = useCallback(() => {
    teamRequest.current?.controller.abort();
    teamRequest.current = null;
    setTeam(EMPTY_TEAM_SNAPSHOT);
    setTeamErrors({});
    setTeamLoading(false);
  }, []);

  const runContextRequest = useCallback(async (
    operation: (signal: AbortSignal) => Promise<CustomerAccountContext>,
  ): Promise<CustomerAccountContext> => {
    contextRequest.current?.controller.abort();
    const controller = new AbortController();
    const revision = ++nextRevision.current;
    contextRequest.current = { revision, controller };
    setLoading(true);
    setError(null);

    try {
      const next = await operation(controller.signal);
      if (contextRequest.current?.revision === revision) {
        if (activeCustomerId.current !== next.activeCustomerId) clearTeam();
        activeCustomerId.current = next.activeCustomerId;
        setAccountContext(next);
      }
      return next;
    } catch (caught) {
      if (!isAbortError(caught) && contextRequest.current?.revision === revision) {
        setError(normalizeError(caught));
      }
      throw caught;
    } finally {
      if (contextRequest.current?.revision === revision) {
        contextRequest.current = null;
        setLoading(false);
      }
    }
  }, [clearTeam]);

  const refreshContext = useCallback(
    () => runContextRequest((signal) => client.getContext({ signal })),
    [client, runContextRequest],
  );

  const switchCustomer = useCallback((customerId: number) => runContextRequest(
    (signal) => client.switchCustomer(customerId, { signal }),
  ), [client, runContextRequest]);

  useEffect(() => {
    if (!auth.ready) {
      setReady(false);
      return;
    }
    if (!auth.session) {
      contextRequest.current?.controller.abort();
      contextRequest.current = null;
      activeCustomerId.current = null;
      setAccountContext(EMPTY_ACCOUNT_CONTEXT);
      clearTeam();
      setLoading(false);
      setError(null);
      setReady(true);
      return;
    }

    setReady(false);
    void refreshContext()
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, [auth.ready, auth.session?.email, auth.session?.userId, clearTeam, refreshContext]);

  useEffect(() => () => {
    contextRequest.current?.controller.abort();
    teamRequest.current?.controller.abort();
  }, []);

  const loadMembers = useCallback(async (input: CustomerMemberListOptions = {}) => {
    const requestedCustomerId = activeCustomerId.current;
    try {
      const page = await client.listMembers(input);
      if (activeCustomerId.current === requestedCustomerId) {
        setTeam((previous) => ({ ...previous, members: page }));
        setTeamErrors((previous) => withoutTeamError(previous, "members"));
      }
      return page;
    } catch (caught) {
      if (activeCustomerId.current === requestedCustomerId) {
        setTeamErrors((previous) => ({ ...previous, members: normalizeError(caught) }));
      }
      throw caught;
    }
  }, [client]);

  const loadInvitations = useCallback(async (input: CustomerInvitationListOptions = {}) => {
    const requestedCustomerId = activeCustomerId.current;
    try {
      const page = await client.listInvitations(input);
      if (activeCustomerId.current === requestedCustomerId) {
        setTeam((previous) => ({ ...previous, invitations: page }));
        setTeamErrors((previous) => withoutTeamError(previous, "invitations"));
      }
      return page;
    } catch (caught) {
      if (activeCustomerId.current === requestedCustomerId) {
        setTeamErrors((previous) => ({ ...previous, invitations: normalizeError(caught) }));
      }
      throw caught;
    }
  }, [client]);

  const loadRoles = useCallback(async (input: CustomerRoleListOptions = {}) => {
    const requestedCustomerId = activeCustomerId.current;
    try {
      const page = await client.listRoles(input);
      if (activeCustomerId.current === requestedCustomerId) {
        setTeam((previous) => ({ ...previous, roles: page }));
        setTeamErrors((previous) => withoutTeamError(previous, "roles"));
      }
      return page;
    } catch (caught) {
      if (activeCustomerId.current === requestedCustomerId) {
        setTeamErrors((previous) => ({ ...previous, roles: normalizeError(caught) }));
      }
      throw caught;
    }
  }, [client]);

  const loadPermissions = useCallback(async () => {
    const requestedCustomerId = activeCustomerId.current;
    try {
      const catalog = await client.listPermissions();
      if (activeCustomerId.current === requestedCustomerId) {
        setTeam((previous) => ({ ...previous, permissionCatalog: catalog }));
        setTeamErrors((previous) => withoutTeamError(previous, "permissions"));
      }
      return catalog;
    } catch (caught) {
      if (activeCustomerId.current === requestedCustomerId) {
        setTeamErrors((previous) => ({ ...previous, permissions: normalizeError(caught) }));
      }
      throw caught;
    }
  }, [client]);

  const refreshTeam = useCallback(async (): Promise<CustomerAccountTeamSnapshot> => {
    teamRequest.current?.controller.abort();
    const controller = new AbortController();
    const revision = ++nextRevision.current;
    teamRequest.current = { revision, controller };
    setTeamLoading(true);
    setTeamErrors({});

    const options = { signal: controller.signal };
    const results = await Promise.allSettled([
      client.listMembers({ page: 1, limit: teamPageSize }, options),
      client.listInvitations({ page: 1, limit: teamPageSize }, options),
      client.listRoles({ page: 1, limit: teamPageSize }, options),
      client.listPermissions(options),
    ] as const);

    const [members, invitations, roles, permissions] = results;
    const next: CustomerAccountTeamSnapshot = {
      members: members.status === "fulfilled" ? members.value : null,
      invitations: invitations.status === "fulfilled" ? invitations.value : null,
      roles: roles.status === "fulfilled" ? roles.value : null,
      permissionCatalog: permissions.status === "fulfilled" ? permissions.value : null,
    };
    const nextErrors: CustomerAccountTeamErrors = {
      ...(members.status === "rejected" && !isAbortError(members.reason)
        ? { members: normalizeError(members.reason) }
        : {}),
      ...(invitations.status === "rejected" && !isAbortError(invitations.reason)
        ? { invitations: normalizeError(invitations.reason) }
        : {}),
      ...(roles.status === "rejected" && !isAbortError(roles.reason)
        ? { roles: normalizeError(roles.reason) }
        : {}),
      ...(permissions.status === "rejected" && !isAbortError(permissions.reason)
        ? { permissions: normalizeError(permissions.reason) }
        : {}),
    };

    if (teamRequest.current?.revision === revision) {
      setTeam(next);
      setTeamErrors(nextErrors);
      setTeamLoading(false);
      teamRequest.current = null;
    }
    return next;
  }, [client, teamPageSize]);

  const permissionSignature = accountContext.activeMembership?.permissions.join("\u0000") ?? "";
  useEffect(() => {
    if (
      !autoLoadTeam
      || !accountContext.activeCustomerId
      || !hasCustomerPermission(accountContext.activeMembership, "commerce.users.view")
    ) {
      clearTeam();
      return;
    }
    void refreshTeam();
  }, [
    accountContext.activeCustomerId,
    autoLoadTeam,
    clearTeam,
    permissionSignature,
    refreshTeam,
  ]);

  const withMutation = useCallback(async <T,>(
    mutation: CustomerAccountMutation,
    operation: () => Promise<T>,
  ): Promise<T> => {
    mutationCounts.current.set(mutation, (mutationCounts.current.get(mutation) ?? 0) + 1);
    setPendingMutations(new Set(mutationCounts.current.keys()));
    setError(null);
    try {
      return await operation();
    } catch (caught) {
      if (!isAbortError(caught)) setError(normalizeError(caught));
      throw caught;
    } finally {
      const remaining = (mutationCounts.current.get(mutation) ?? 1) - 1;
      if (remaining > 0) mutationCounts.current.set(mutation, remaining);
      else mutationCounts.current.delete(mutation);
      setPendingMutations(new Set(mutationCounts.current.keys()));
    }
  }, []);

  const createInvitation = useCallback((input: CreateCustomerInvitationInput) => withMutation(
    "invite",
    async () => {
      const customerId = activeCustomerId.current;
      const invitation = await client.createInvitation(input);
      if (activeCustomerId.current === customerId) {
        setTeam((previous) => ({
          ...previous,
          invitations: addInvitationToPage(previous.invitations, invitation),
        }));
      }
      return invitation;
    },
  ), [client, withMutation]);

  const updateMemberRole = useCallback((input: UpdateCustomerMemberRoleInput) => withMutation(
    `member:${input.userId}:role`,
    async () => {
      const customerId = activeCustomerId.current;
      const member = await client.updateMemberRole(input);
      if (activeCustomerId.current === customerId) {
        setTeam((previous) => ({
          ...previous,
          members: replaceMember(previous.members, member),
        }));
        if (member.userId === auth.session?.userId) {
          setAccountContext((previous) => ({
            ...previous,
            memberships: previous.memberships.map((item) => (
              item.customerId === member.customerId ? member : item
            )),
            activeMembership: previous.activeCustomerId === member.customerId
              ? member
              : previous.activeMembership,
          }));
        }
      }
      return member;
    },
  ), [auth.session?.userId, client, withMutation]);

  const removeMember = useCallback((userId: number) => withMutation(
    `member:${userId}:remove`,
    async () => {
      const customerId = activeCustomerId.current;
      await client.removeMember(userId);
      if (activeCustomerId.current === customerId) {
        setTeam((previous) => ({
          ...previous,
          members: removeMemberFromPage(previous.members, userId),
        }));
        if (userId === auth.session?.userId) await refreshContext();
      }
    },
  ), [auth.session?.userId, client, refreshContext, withMutation]);

  const revokeInvitation = useCallback((invitationId: number) => withMutation(
    `invitation:${invitationId}:revoke`,
    async () => {
      const customerId = activeCustomerId.current;
      await client.revokeInvitation(invitationId);
      if (activeCustomerId.current === customerId) {
        setTeam((previous) => ({
          ...previous,
          invitations: removeInvitationFromPage(previous.invitations, invitationId),
        }));
        setInspectedInvitation((previous) => previous?.id === invitationId ? null : previous);
      }
    },
  ), [client, withMutation]);

  const inspectInvitation = useCallback(async (token: string) => {
    setError(null);
    setInspectedInvitation(null);
    try {
      const invitation = await client.inspectInvitation(token);
      setInspectedInvitation(invitation);
      return invitation;
    } catch (caught) {
      setError(normalizeError(caught));
      throw caught;
    }
  }, [client]);

  const acceptInvitation = useCallback((token: string) => withMutation(
    "accept-invitation",
    async () => {
      const membership = await client.acceptInvitation(token);
      setInspectedInvitation(null);
      try {
        await refreshContext();
      } catch {
        setAccountContext((previous) => ({
          memberships: [
            membership,
            ...previous.memberships.filter((item) => item.customerId !== membership.customerId),
          ],
          activeCustomerId: membership.customerId,
          activeMembership: membership,
        }));
        activeCustomerId.current = membership.customerId;
      }
      return membership;
    },
  ), [client, refreshContext, withMutation]);

  const signInAndAcceptInvitation = useCallback(async (
    token: string,
    input: OminityAuthSignInInput,
  ): Promise<CustomerInvitationAuthenticationResult> => {
    const invitation = await inspectInvitation(token);
    requireMatchingInvitationEmail(invitation, input.email ?? "");
    const result = await auth.signIn(input);
    if (result.requiresMfa) {
      return { status: "requires-mfa", invitation, methods: result.methods };
    }
    if (!result.session) return { status: "requires-sign-in", invitation };
    return { status: "accepted", invitation, membership: await acceptInvitation(token) };
  }, [acceptInvitation, auth, inspectInvitation]);

  const registerAndAcceptInvitation = useCallback(async (
    token: string,
    input: OminityAuthRegisterInput,
  ): Promise<CustomerInvitationAuthenticationResult> => {
    const invitation = await inspectInvitation(token);
    requireMatchingInvitationEmail(invitation, input.email ?? "");
    const session = await auth.register(input);
    if (!session) return { status: "requires-sign-in", invitation };
    return { status: "accepted", invitation, membership: await acceptInvitation(token) };
  }, [acceptInvitation, auth, inspectInvitation]);

  const can = useCallback(
    (permission: string) => hasCustomerPermission(accountContext.activeMembership, permission),
    [accountContext.activeMembership],
  );
  const canAll = useCallback(
    (required: CustomerPermissionRequirement) => hasEveryCustomerPermission(
      accountContext.activeMembership,
      required,
    ),
    [accountContext.activeMembership],
  );
  const canAny = useCallback(
    (required: CustomerPermissionRequirement) => hasAnyCustomerPermission(
      accountContext.activeMembership,
      required,
    ),
    [accountContext.activeMembership],
  );
  const clearError = useCallback(() => setError(null), []);
  const isMutationPending = useCallback(
    (mutation: CustomerAccountMutation) => pendingMutations.has(mutation),
    [pendingMutations],
  );

  const value = useMemo<OminityCustomerAccountsContextValue>(() => ({
    ready,
    loading,
    teamLoading,
    error,
    teamErrors,
    memberships: accountContext.memberships,
    activeCustomerId: accountContext.activeCustomerId,
    activeMembership: accountContext.activeMembership,
    members: team.members,
    invitations: team.invitations,
    roles: team.roles,
    permissionCatalog: team.permissionCatalog,
    inspectedInvitation,
    pendingMutations,
    can,
    canAll,
    canAny,
    isMutationPending,
    clearError,
    refreshContext,
    switchCustomer,
    refreshTeam,
    loadMembers,
    loadInvitations,
    loadRoles,
    loadPermissions,
    createInvitation,
    updateMemberRole,
    removeMember,
    revokeInvitation,
    inspectInvitation,
    acceptInvitation,
    signInAndAcceptInvitation,
    registerAndAcceptInvitation,
  }), [
    ready,
    loading,
    teamLoading,
    error,
    teamErrors,
    accountContext,
    team,
    inspectedInvitation,
    pendingMutations,
    can,
    canAll,
    canAny,
    isMutationPending,
    clearError,
    refreshContext,
    switchCustomer,
    refreshTeam,
    loadMembers,
    loadInvitations,
    loadRoles,
    loadPermissions,
    createInvitation,
    updateMemberRole,
    removeMember,
    revokeInvitation,
    inspectInvitation,
    acceptInvitation,
    signInAndAcceptInvitation,
    registerAndAcceptInvitation,
  ]);

  return (
    <CustomerAccountsContext.Provider value={value}>
      {props.children}
    </CustomerAccountsContext.Provider>
  );
}

export function useOminityCustomerAccounts(): OminityCustomerAccountsContextValue {
  const value = useContext(CustomerAccountsContext);
  if (!value) {
    throw new Error(
      "useOminityCustomerAccounts must be used inside OminityCustomerAccountsProvider.",
    );
  }
  return value;
}

export function useCustomerPermission(
  required: CustomerPermissionRequirement,
  mode: "all" | "any" = "all",
): boolean {
  const accounts = useOminityCustomerAccounts();
  return mode === "any" ? accounts.canAny(required) : accounts.canAll(required);
}

export interface CustomerPermissionBoundaryProps {
  readonly required: CustomerPermissionRequirement;
  readonly mode?: "all" | "any";
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}

export function CustomerPermissionBoundary(props: CustomerPermissionBoundaryProps) {
  const allowed = useCustomerPermission(props.required, props.mode ?? "all");
  return allowed ? props.children : (props.fallback ?? null);
}
