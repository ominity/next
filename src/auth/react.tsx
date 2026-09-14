"use client";

import type { UserCreateInput } from "@ominity/api-typescript/models/operations";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useOminityDebugCapability } from "../debug/context.js";
import type { OminityDebugAuthInfo } from "../debug/types.js";
import type {
  OminityAuthPublicLoginActivity,
  OminityAuthPublicLoginActivityPage,
  OminityAuthPublicMfaMethod,
  OminityAuthPublicSession,
  OminityAuthRouteUser,
} from "./server/route-handlers.js";

const DEFAULT_ADDRESS_STORAGE_PREFIX = "ominity:auth:addresses";

export type OminityBrowserAuthSession = OminityAuthPublicSession;
export type OminityBrowserMfaMethod = OminityAuthPublicMfaMethod;
export type OminityBrowserLoginActivity = OminityAuthPublicLoginActivity;
export type OminityBrowserLoginActivityPage = OminityAuthPublicLoginActivityPage;

export interface OminitySavedCheckoutAddress {
  readonly id: string;
  readonly label: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly street: string;
  readonly number: string;
  readonly additional: string;
  readonly city: string;
  readonly postalCode: string;
  readonly region: string;
  readonly country: string;
  readonly phone?: string;
}

export interface OminityAuthSignInInput {
  readonly email: string;
  readonly password: string;
}

export type OminityAuthRegisterInput = Required<
  Pick<UserCreateInput, "firstName" | "email" | "password">
> & Pick<UserCreateInput, "lastName">;

export interface OminityAuthSignInResult {
  readonly session: OminityBrowserAuthSession | null;
  readonly requiresMfa: boolean;
  readonly methods: ReadonlyArray<OminityBrowserMfaMethod>;
}

export interface OminityLoginActivityListOptions {
  readonly page?: number;
  readonly limit?: number;
  readonly sort?: string;
  readonly id?: number;
  readonly ipAddress?: string;
  readonly location?: string;
}

export interface OminityAuthEndpoints {
  readonly me: string;
  readonly login: string;
  readonly register: string;
  readonly logout: string;
  readonly mfaMethods: string;
  readonly mfaSend: string;
  readonly mfaValidate: string;
  readonly recoveryValidate: string;
  readonly loginActivity: string;
}

const DEFAULT_ENDPOINTS: OminityAuthEndpoints = {
  me: "/api/auth/me",
  login: "/api/auth/login",
  register: "/api/auth/register",
  logout: "/api/auth/logout",
  mfaMethods: "/api/auth/mfa/methods",
  mfaSend: "/api/auth/mfa/send",
  mfaValidate: "/api/auth/mfa/validate",
  recoveryValidate: "/api/auth/mfa/recovery/validate",
  loginActivity: "/api/auth/login-activity",
};

interface AuthApiResponse {
  readonly authenticated?: boolean;
  readonly session?: OminityBrowserAuthSession;
  readonly user?: OminityAuthRouteUser;
}

interface MfaMethodsResponse {
  readonly items?: ReadonlyArray<OminityBrowserMfaMethod>;
}

interface StatusResponse {
  readonly ok?: boolean;
}

interface LoginActivityItemResponse {
  readonly item?: OminityBrowserLoginActivity;
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable; callers still retain in-memory state.
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A missing or malformed response body is handled by the status below.
  }

  if (!response.ok) {
    const message = typeof payload === "object"
      && payload !== null
      && typeof (payload as { error?: unknown }).error === "string"
      ? (payload as { error: string }).error
      : `Request failed (${response.status}).`;
    throw new Error(message);
  }

  return payload as T;
}

function positiveLoginActivityNumber(value: number | undefined, field: string): number | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${field} must be a positive integer.`);
  }

  return value;
}

function loginActivityListUrl(
  endpoint: string,
  options: OminityLoginActivityListOptions,
): string {
  const search = new URLSearchParams();
  const page = positiveLoginActivityNumber(options.page, "page");
  const limit = positiveLoginActivityNumber(options.limit, "limit");
  const id = positiveLoginActivityNumber(options.id, "id");
  if (typeof page === "number") search.set("page", String(page));
  if (typeof limit === "number") search.set("limit", String(limit));
  if (typeof id === "number") search.set("id", String(id));
  if (options.sort?.trim()) search.set("sort", options.sort.trim());
  if (options.ipAddress?.trim()) search.set("ipAddress", options.ipAddress.trim());
  if (options.location?.trim()) search.set("location", options.location.trim());

  const query = search.toString();
  return query.length === 0
    ? endpoint
    : `${endpoint}${endpoint.includes("?") ? "&" : "?"}${query}`;
}

function loginActivityItemUrl(endpoint: string, loginId: number): string {
  const id = positiveLoginActivityNumber(loginId, "loginId");
  return `${endpoint.replace(/\/+$/, "")}/${encodeURIComponent(String(id))}`;
}

function normalizeAuthSession(
  response: AuthApiResponse,
): OminityBrowserAuthSession | null {
  const { session, user } = response;
  if (!session || response.authenticated === false) {
    return null;
  }

  return {
    ...(typeof session.userId === "number"
      ? { userId: session.userId }
      : typeof user?.id === "number"
        ? { userId: user.id }
        : {}),
    ...(typeof session.email === "string"
      ? { email: session.email }
      : typeof user?.email === "string"
        ? { email: user.email }
        : {}),
    ...(typeof session.firstName === "string"
      ? { firstName: session.firstName }
      : typeof user?.firstName === "string"
        ? { firstName: user.firstName }
        : {}),
    ...(typeof session.lastName === "string"
      ? { lastName: session.lastName }
      : typeof user?.lastName === "string"
        ? { lastName: user.lastName }
        : {}),
    ...(typeof session.isMfaEnabled === "boolean"
      ? { isMfaEnabled: session.isMfaEnabled }
      : typeof user?.isMfaEnabled === "boolean"
        ? { isMfaEnabled: user.isMfaEnabled }
        : {}),
    expiresAt: session.expiresAt,
  };
}

function normalizeLoginActivityItem(value: unknown): OminityBrowserLoginActivity {
  if (typeof value !== "object" || value === null) {
    throw new Error("Login activity response item is invalid.");
  }

  const record = value as Record<string, unknown>;
  if (
    record.resource !== "user_login"
    || typeof record.id !== "number"
    || typeof record.userId !== "number"
  ) {
    throw new Error("Login activity response item is missing required fields.");
  }

  return {
    resource: "user_login",
    id: record.id,
    userId: record.userId,
    ...(typeof record.ipAddress === "string" ? { ipAddress: record.ipAddress } : {}),
    ...(typeof record.location === "string" || record.location === null
      ? { location: record.location }
      : {}),
    ...(typeof record.device === "string" || record.device === null
      ? { device: record.device }
      : {}),
    ...(typeof record.browser === "string" || record.browser === null
      ? { browser: record.browser }
      : {}),
    ...(typeof record.userAgent === "string" ? { userAgent: record.userAgent } : {}),
    ...(typeof record.createdAt === "string" ? { createdAt: record.createdAt } : {}),
  };
}

function normalizeLoginActivityPage(value: unknown): OminityBrowserLoginActivityPage {
  if (typeof value !== "object" || value === null) {
    throw new Error("Login activity response is invalid.");
  }

  const record = value as Record<string, unknown>;
  if (
    !Array.isArray(record.items)
    || typeof record.count !== "number"
    || typeof record.page !== "number"
    || typeof record.limit !== "number"
    || typeof record.totalPages !== "number"
    || typeof record.hasNext !== "boolean"
    || typeof record.hasPrevious !== "boolean"
  ) {
    throw new Error("Login activity response is missing pagination fields.");
  }

  return {
    items: record.items.map(normalizeLoginActivityItem),
    count: record.count,
    page: record.page,
    limit: record.limit,
    totalPages: record.totalPages,
    hasNext: record.hasNext,
    hasPrevious: record.hasPrevious,
  };
}

function normalizeAddressList(value: unknown): ReadonlyArray<OminitySavedCheckoutAddress> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry): OminitySavedCheckoutAddress[] => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const required = [
      "id",
      "label",
      "firstName",
      "lastName",
      "street",
      "number",
      "city",
      "postalCode",
      "country",
    ] as const;
    if (
      required.some((key) => typeof record[key] !== "string" || record[key].length === 0)
      || typeof record.additional !== "string"
      || typeof record.region !== "string"
    ) {
      return [];
    }

    return [{
      id: record.id as string,
      label: record.label as string,
      firstName: record.firstName as string,
      lastName: record.lastName as string,
      street: record.street as string,
      number: record.number as string,
      additional: record.additional as string,
      city: record.city as string,
      postalCode: record.postalCode as string,
      region: record.region as string,
      country: record.country as string,
      ...(typeof record.phone === "string" && record.phone.length > 0
        ? { phone: record.phone }
        : {}),
    }];
  });
}

function addressStorageKey(
  prefix: string,
  session: OminityBrowserAuthSession | null,
): string | null {
  return session?.email ? `${prefix}:${session.email.toLowerCase()}` : null;
}

function methodRequiresChallenge(method: OminityBrowserMfaMethod): boolean {
  if (!method.isEnabled) {
    return false;
  }

  const name = method.method.trim().toLowerCase();
  return name === "totp" || name === "otp" || name === "email" || name === "sms";
}

function areMfaMethodsEqual(
  left: ReadonlyArray<OminityBrowserMfaMethod>,
  right: ReadonlyArray<OminityBrowserMfaMethod>,
): boolean {
  return left.length === right.length && left.every((previous, index) => {
    const next = right[index];
    return !!next
      && previous.method === next.method
      && previous.isEnabled === next.isEnabled
      && (previous.verifiedAt ?? null) === (next.verifiedAt ?? null)
      && (previous.lastUsedAt ?? null) === (next.lastUsedAt ?? null)
      && (previous.lastSentAt ?? null) === (next.lastSentAt ?? null);
  });
}

export interface OminityAuthContextValue {
  readonly ready: boolean;
  readonly session: OminityBrowserAuthSession | null;
  readonly mfaMethods: ReadonlyArray<OminityBrowserMfaMethod>;
  readonly mfaVerified: boolean;
  readonly savedAddresses: ReadonlyArray<OminitySavedCheckoutAddress>;
  readonly loginActivity: OminityBrowserLoginActivityPage | null;
  readonly loginActivityLoading: boolean;
  readonly loginActivityError: Error | null;
  refreshAuth(): Promise<void>;
  signIn(input: OminityAuthSignInInput): Promise<OminityAuthSignInResult>;
  register(input: OminityAuthRegisterInput): Promise<OminityBrowserAuthSession | null>;
  signOut(): Promise<void>;
  listMfaMethods(): Promise<ReadonlyArray<OminityBrowserMfaMethod>>;
  sendMfaCode(method: string): Promise<boolean>;
  validateMfaCode(method: string, code: string): Promise<boolean>;
  validateRecoveryCode(code: string): Promise<boolean>;
  listLoginActivity(
    options?: OminityLoginActivityListOptions,
  ): Promise<OminityBrowserLoginActivityPage>;
  getLoginActivity(loginId: number): Promise<OminityBrowserLoginActivity>;
  saveAddress(
    address: Omit<OminitySavedCheckoutAddress, "id"> & { readonly id?: string },
  ): OminitySavedCheckoutAddress;
  deleteSavedAddress(addressId: string): void;
}

const AuthContext = createContext<OminityAuthContextValue | null>(null);

export interface OminityAuthProviderProps {
  readonly children: ReactNode;
  readonly endpoints?: Partial<OminityAuthEndpoints>;
  readonly addressStoragePrefix?: string;
}

export function OminityAuthProvider(props: OminityAuthProviderProps) {
  const endpoints = useMemo(
    () => ({ ...DEFAULT_ENDPOINTS, ...props.endpoints }),
    [props.endpoints],
  );
  const storagePrefix = props.addressStoragePrefix ?? DEFAULT_ADDRESS_STORAGE_PREFIX;
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<OminityBrowserAuthSession | null>(null);
  const [mfaMethods, setMfaMethods] = useState<ReadonlyArray<OminityBrowserMfaMethod>>([]);
  const [mfaVerified, setMfaVerified] = useState(true);
  const [savedAddresses, setSavedAddresses] = useState<ReadonlyArray<OminitySavedCheckoutAddress>>([]);
  const [loginActivity, setLoginActivity] = useState<OminityBrowserLoginActivityPage | null>(null);
  const [loginActivityLoading, setLoginActivityLoading] = useState(false);
  const [loginActivityError, setLoginActivityError] = useState<Error | null>(null);

  const loadSavedAddresses = useCallback((nextSession: OminityBrowserAuthSession | null) => {
    const key = addressStorageKey(storagePrefix, nextSession);
    setSavedAddresses(key ? normalizeAddressList(readStorage<unknown>(key, [])) : []);
  }, [storagePrefix]);

  const refreshAuth = useCallback(async () => {
    const response = await requestJson<AuthApiResponse>(endpoints.me);
    const nextSession = normalizeAuthSession(response);
    setSession(nextSession);
    loadSavedAddresses(nextSession);
  }, [endpoints.me, loadSavedAddresses]);

  useEffect(() => {
    void refreshAuth()
      .catch(() => {
        setSession(null);
        setSavedAddresses([]);
      })
      .finally(() => setReady(true));
  }, [refreshAuth]);

  useEffect(() => {
    const key = addressStorageKey(storagePrefix, session);
    if (ready && key) {
      writeStorage(key, savedAddresses);
    }
  }, [ready, savedAddresses, session, storagePrefix]);

  useEffect(() => {
    setLoginActivity(null);
    setLoginActivityError(null);
    setLoginActivityLoading(false);
  }, [session?.userId]);

  const listMfaMethods = useCallback(async () => {
    const response = await requestJson<MfaMethodsResponse>(endpoints.mfaMethods);
    const list = Array.isArray(response.items) ? response.items : [];
    setMfaMethods((previous) => areMfaMethodsEqual(previous, list) ? previous : list);
    return list;
  }, [endpoints.mfaMethods]);

  const listLoginActivity = useCallback(async (
    options: OminityLoginActivityListOptions = {},
  ): Promise<OminityBrowserLoginActivityPage> => {
    if (!session) {
      throw new Error("You must be authenticated to view login activity.");
    }

    setLoginActivityLoading(true);
    setLoginActivityError(null);
    try {
      const response = await requestJson<unknown>(
        loginActivityListUrl(endpoints.loginActivity, options),
      );
      const page = normalizeLoginActivityPage(response);
      setLoginActivity(page);
      return page;
    } catch (error) {
      const normalized = error instanceof Error
        ? error
        : new Error("Could not load login activity.");
      setLoginActivityError(normalized);
      throw normalized;
    } finally {
      setLoginActivityLoading(false);
    }
  }, [endpoints.loginActivity, session]);

  const getLoginActivity = useCallback(async (
    loginId: number,
  ): Promise<OminityBrowserLoginActivity> => {
    if (!session) {
      throw new Error("You must be authenticated to view login activity.");
    }

    setLoginActivityLoading(true);
    setLoginActivityError(null);
    try {
      const response = await requestJson<LoginActivityItemResponse>(
        loginActivityItemUrl(endpoints.loginActivity, loginId),
      );
      return normalizeLoginActivityItem(response.item);
    } catch (error) {
      const normalized = error instanceof Error
        ? error
        : new Error("Could not load login activity.");
      setLoginActivityError(normalized);
      throw normalized;
    } finally {
      setLoginActivityLoading(false);
    }
  }, [endpoints.loginActivity, session]);

  const signIn = useCallback(async (
    input: OminityAuthSignInInput,
  ): Promise<OminityAuthSignInResult> => {
    const response = await requestJson<AuthApiResponse>(endpoints.login, {
      method: "POST",
      body: JSON.stringify(input),
    });
    const nextSession = normalizeAuthSession(response);
    setSession(nextSession);
    loadSavedAddresses(nextSession);

    let methods: ReadonlyArray<OminityBrowserMfaMethod> = [];
    try {
      methods = await listMfaMethods();
    } catch {
      setMfaMethods([]);
    }
    const requiresMfa = methods.some(methodRequiresChallenge);
    setMfaVerified(!requiresMfa);
    return { session: nextSession, requiresMfa, methods };
  }, [endpoints.login, listMfaMethods, loadSavedAddresses]);

  const register = useCallback(async (
    input: OminityAuthRegisterInput,
  ): Promise<OminityBrowserAuthSession | null> => {
    const response = await requestJson<AuthApiResponse>(endpoints.register, {
      method: "POST",
      body: JSON.stringify(input),
    });
    const nextSession = normalizeAuthSession(response);
    setSession(nextSession);
    loadSavedAddresses(nextSession);
    setMfaMethods([]);
    setMfaVerified(true);
    return nextSession;
  }, [endpoints.register, loadSavedAddresses]);

  const signOut = useCallback(async () => {
    await requestJson<StatusResponse>(endpoints.logout, { method: "POST" });
    setSession(null);
    setMfaMethods([]);
    setMfaVerified(true);
    setSavedAddresses([]);
    setLoginActivity(null);
    setLoginActivityError(null);
    setLoginActivityLoading(false);
  }, [endpoints.logout]);

  const sendMfaCode = useCallback(async (method: string) => {
    const response = await requestJson<StatusResponse>(endpoints.mfaSend, {
      method: "POST",
      body: JSON.stringify({ method }),
    });
    return response.ok === true;
  }, [endpoints.mfaSend]);

  const validateMfaCode = useCallback(async (method: string, code: string) => {
    const response = await requestJson<StatusResponse>(endpoints.mfaValidate, {
      method: "POST",
      body: JSON.stringify({ method, code }),
    });
    const ok = response.ok === true;
    if (ok) setMfaVerified(true);
    return ok;
  }, [endpoints.mfaValidate]);

  const validateRecoveryCode = useCallback(async (code: string) => {
    const response = await requestJson<StatusResponse>(endpoints.recoveryValidate, {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    const ok = response.ok === true;
    if (ok) setMfaVerified(true);
    return ok;
  }, [endpoints.recoveryValidate]);

  const saveAddress = useCallback((
    address: Omit<OminitySavedCheckoutAddress, "id"> & { readonly id?: string },
  ): OminitySavedCheckoutAddress => {
    const normalized: OminitySavedCheckoutAddress = {
      id: address.id?.trim() || `addr_${crypto.randomUUID()}`,
      label: address.label.trim(),
      firstName: address.firstName.trim(),
      lastName: address.lastName.trim(),
      street: address.street.trim(),
      number: address.number.trim(),
      additional: address.additional.trim(),
      city: address.city.trim(),
      postalCode: address.postalCode.trim(),
      region: address.region.trim(),
      country: address.country.trim(),
      ...(address.phone?.trim() ? { phone: address.phone.trim() } : {}),
    };
    setSavedAddresses((previous) => [
      ...previous.filter((entry) => entry.id !== normalized.id),
      normalized,
    ]);
    return normalized;
  }, []);

  const deleteSavedAddress = useCallback((addressId: string) => {
    setSavedAddresses((previous) => previous.filter((entry) => entry.id !== addressId));
  }, []);

  const value = useMemo<OminityAuthContextValue>(() => ({
    ready,
    session,
    mfaMethods,
    mfaVerified,
    savedAddresses,
    loginActivity,
    loginActivityLoading,
    loginActivityError,
    refreshAuth,
    signIn,
    register,
    signOut,
    listMfaMethods,
    sendMfaCode,
    validateMfaCode,
    validateRecoveryCode,
    listLoginActivity,
    getLoginActivity,
    saveAddress,
    deleteSavedAddress,
  }), [
    ready,
    session,
    mfaMethods,
    mfaVerified,
    savedAddresses,
    loginActivity,
    loginActivityLoading,
    loginActivityError,
    refreshAuth,
    signIn,
    register,
    signOut,
    listMfaMethods,
    sendMfaCode,
    validateMfaCode,
    validateRecoveryCode,
    listLoginActivity,
    getLoginActivity,
    saveAddress,
    deleteSavedAddress,
  ]);

  const debugAuth = useMemo<OminityDebugAuthInfo>(() => ({
    enabled: true,
    ready,
    authenticated: !!session,
    user: session
      ? {
        ...(typeof session.userId !== "undefined" ? { userId: session.userId } : {}),
        ...(session.email ? { email: session.email } : {}),
        ...(session.firstName ? { firstName: session.firstName } : {}),
        ...(session.lastName ? { lastName: session.lastName } : {}),
      }
      : null,
    session,
    mfaVerified,
    mfaMethods,
    loginActivity: loginActivity?.items ?? [],
    savedAddressCount: savedAddresses.length,
    actions: {
      refresh: refreshAuth,
      signIn: async (input) => {
        await signIn(input);
      },
      signOut,
    },
    details: {
      endpoints,
      loginActivityLoading,
      loginActivityError: loginActivityError?.message,
      addressStoragePrefix: storagePrefix,
    },
  }), [
    endpoints,
    loginActivity?.items,
    loginActivityError?.message,
    loginActivityLoading,
    mfaMethods,
    mfaVerified,
    ready,
    refreshAuth,
    savedAddresses.length,
    session,
    signIn,
    signOut,
    storagePrefix,
  ]);
  useOminityDebugCapability("auth", debugAuth);

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useOminityAuth(): OminityAuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useOminityAuth must be used inside OminityAuthProvider.");
  }
  return value;
}

export interface UseOminityLoginActivityOptions extends OminityLoginActivityListOptions {
  readonly enabled?: boolean;
}

export interface UseOminityLoginActivityResult {
  readonly items: ReadonlyArray<OminityBrowserLoginActivity>;
  readonly page: OminityBrowserLoginActivityPage | null;
  readonly loading: boolean;
  readonly error: Error | null;
  refresh(): Promise<OminityBrowserLoginActivityPage>;
  get(loginId: number): Promise<OminityBrowserLoginActivity>;
}

/**
 * Loads the authenticated user's login activity when mounted. Consumers only
 * need to render the returned records and pagination state.
 */
export function useOminityLoginActivity(
  options: UseOminityLoginActivityOptions = {},
): UseOminityLoginActivityResult {
  const auth = useOminityAuth();
  const enabled = options.enabled !== false;
  const listOptions = useMemo<OminityLoginActivityListOptions>(() => ({
    ...(typeof options.page === "number" ? { page: options.page } : {}),
    ...(typeof options.limit === "number" ? { limit: options.limit } : {}),
    ...(typeof options.sort === "string" ? { sort: options.sort } : {}),
    ...(typeof options.id === "number" ? { id: options.id } : {}),
    ...(typeof options.ipAddress === "string" ? { ipAddress: options.ipAddress } : {}),
    ...(typeof options.location === "string" ? { location: options.location } : {}),
  }), [
    options.id,
    options.ipAddress,
    options.limit,
    options.location,
    options.page,
    options.sort,
  ]);

  const refresh = useCallback(
    () => auth.listLoginActivity(listOptions),
    [auth.listLoginActivity, listOptions],
  );

  useEffect(() => {
    if (!enabled || !auth.session) {
      return;
    }

    void refresh().catch(() => {
      // The provider exposes the normalized error for the rendering layer.
    });
  }, [auth.session, enabled, refresh]);

  return {
    items: auth.loginActivity?.items ?? [],
    page: auth.loginActivity,
    loading: auth.loginActivityLoading,
    error: auth.loginActivityError,
    refresh,
    get: auth.getLoginActivity,
  };
}
