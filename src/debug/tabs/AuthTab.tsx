"use client";

import {
  useCallback,
  useState,
  type ChangeEvent,
} from "react";

import type {
  OminityDebugAuthInfo,
  OminityDebugCustomerInfo,
} from "../types.js";
import {
  EmptyState,
  Field,
  JsonPanel,
  MONO_FONT,
  Panel,
  buttonStyle,
  formatDateTime,
  inputStyle,
  mutedTextStyle,
  pillStyle,
  sectionTitleStyle,
  type Palette,
} from "../ui.js";

interface DebugFormEvent {
  preventDefault(): void;
}

function isActiveCustomer(
  customerId: string | number | undefined,
  activeCustomerId: string | number | null | undefined,
): boolean {
  return typeof customerId !== "undefined"
    && typeof activeCustomerId !== "undefined"
    && activeCustomerId !== null
    && String(customerId) === String(activeCustomerId);
}

function membershipLabel(membership: NonNullable<OminityDebugCustomerInfo["memberships"]>[number]): string {
  return membership.customer?.name
    ?? membership.name
    ?? membership.customer?.identifier
    ?? (typeof membership.customerId !== "undefined" ? `Customer ${membership.customerId}` : "Customer");
}

function authUserName(auth: OminityDebugAuthInfo | undefined): string {
  const user = auth?.user;
  const session = auth?.session;
  const name = user?.name
    ?? [user?.firstName ?? session?.firstName, user?.lastName ?? session?.lastName]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(" ");

  return name || user?.email || session?.email || "No authenticated user";
}

export function AuthTab(props: {
  readonly palette: Palette;
  readonly auth: OminityDebugAuthInfo | false | undefined;
  readonly customer: OminityDebugCustomerInfo | false | undefined;
}) {
  const auth = props.auth === false ? undefined : props.auth;
  const customer = props.customer === false ? undefined : props.customer;
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [spoofUserId, setSpoofUserId] = useState("");
  const [spoofEmail, setSpoofEmail] = useState("");
  const [spoofCustomerId, setSpoofCustomerId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

  const runAction = useCallback(async (name: string, action: () => void | Promise<void>) => {
    setActionPending(name);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Debug action failed.");
    } finally {
      setActionPending(null);
    }
  }, []);

  const submitSignIn = useCallback((event: DebugFormEvent) => {
    event.preventDefault();
    if (!auth?.actions?.signIn) return;
    void runAction("sign-in", () => auth.actions!.signIn!({
      email: signInEmail,
      password: signInPassword,
    }));
  }, [auth, runAction, signInEmail, signInPassword]);

  const submitSpoof = useCallback((event: DebugFormEvent) => {
    event.preventDefault();
    if (!auth?.actions?.spoofUser) return;
    void runAction("spoof", () => auth.actions!.spoofUser!({
      ...(spoofUserId.trim() ? { userId: spoofUserId.trim() } : {}),
      ...(spoofEmail.trim() ? { email: spoofEmail.trim() } : {}),
      ...(spoofCustomerId.trim() ? { customerId: spoofCustomerId.trim() } : {}),
    }));
  }, [auth, runAction, spoofCustomerId, spoofEmail, spoofUserId]);

  const switchCustomer = useCallback((customerId: string | number) => {
    if (!customer?.actions?.switchCustomer) return;
    void runAction("switch-customer", () => customer.actions!.switchCustomer!(customerId));
  }, [customer, runAction]);

  if (!auth && !customer) {
    return (
      <EmptyState palette={props.palette}>
        Pass `auth` and `customer` context into `OminityDebugBar` to inspect sessions, MFA, memberships, and test-only auth actions.
      </EmptyState>
    );
  }

  const memberships = customer?.memberships ?? [];
  const activeMembership = customer?.activeMembership ?? memberships.find((membership) => (
    isActiveCustomer(membership.customerId, customer?.activeCustomerId)
  )) ?? null;

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      {actionError && (
        <Panel palette={props.palette} style={{ borderColor: props.palette.danger, backgroundColor: props.palette.dangerSoft, color: props.palette.danger, fontSize: "12px" }}>
          {actionError}
        </Panel>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "10px" }}>
        <Panel palette={props.palette}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
            <h3 style={sectionTitleStyle(props.palette)}>Authenticated User</h3>
            <span style={pillStyle(props.palette, auth?.authenticated ?? !!auth?.session ? "success" : "default")}>
              {auth?.ready === false ? "loading" : auth?.authenticated ?? !!auth?.session ? "authenticated" : "guest"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px", marginTop: "10px" }}>
            <Field palette={props.palette} label="Name" value={authUserName(auth)} />
            <Field palette={props.palette} label="Email" value={auth?.user?.email ?? auth?.session?.email} mono />
            <Field palette={props.palette} label="User ID" value={auth?.user?.userId ?? auth?.user?.id ?? auth?.session?.userId} mono />
            <Field palette={props.palette} label="Session expires" value={formatDateTime(auth?.session?.expiresAt)} />
            <Field palette={props.palette} label="MFA enabled" value={auth?.session?.isMfaEnabled} />
            <Field palette={props.palette} label="MFA verified" value={auth?.mfaVerified} />
            <Field palette={props.palette} label="Saved addresses" value={auth?.savedAddressCount} mono />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
            <button
              type="button"
              disabled={!auth?.actions?.refresh || actionPending !== null}
              onClick={() => auth?.actions?.refresh && void runAction("refresh-auth", auth.actions.refresh)}
              style={{ ...buttonStyle(props.palette), opacity: !auth?.actions?.refresh ? 0.5 : 1 }}
            >
              {actionPending === "refresh-auth" ? "Refreshing..." : "Refresh Auth"}
            </button>
            <button
              type="button"
              disabled={!auth?.actions?.signOut || actionPending !== null}
              onClick={() => auth?.actions?.signOut && void runAction("sign-out", auth.actions.signOut)}
              style={{ ...buttonStyle(props.palette), opacity: !auth?.actions?.signOut ? 0.5 : 1 }}
            >
              {actionPending === "sign-out" ? "Signing out..." : "Sign Out"}
            </button>
          </div>
        </Panel>

        <Panel palette={props.palette}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
            <h3 style={sectionTitleStyle(props.palette)}>Active Customer</h3>
            <span style={pillStyle(props.palette, customer?.activeCustomerId ? "success" : "default")}>
              {customer?.activeCustomerId ? `#${customer.activeCustomerId}` : "none"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px", marginTop: "10px" }}>
            <Field palette={props.palette} label="Customer" value={activeMembership ? membershipLabel(activeMembership) : undefined} />
            <Field palette={props.palette} label="Customer ID" value={customer?.activeCustomerId} mono />
            <Field palette={props.palette} label="Role" value={activeMembership?.roleName ?? activeMembership?.roleKey ?? activeMembership?.roleId} />
            <Field palette={props.palette} label="Permissions" value={activeMembership?.permissions?.length} mono />
            <Field palette={props.palette} label="Members" value={customer?.memberCount} mono />
            <Field palette={props.palette} label="Invitations" value={customer?.invitationCount} mono />
            <Field palette={props.palette} label="Ready" value={customer?.ready} />
            <Field palette={props.palette} label="Loading" value={customer?.loading} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
            <button
              type="button"
              disabled={!customer?.actions?.refresh || actionPending !== null}
              onClick={() => customer?.actions?.refresh && void runAction("refresh-customer", customer.actions.refresh)}
              style={{ ...buttonStyle(props.palette), opacity: !customer?.actions?.refresh ? 0.5 : 1 }}
            >
              {actionPending === "refresh-customer" ? "Refreshing..." : "Refresh Customer"}
            </button>
          </div>
        </Panel>
      </div>

      <Panel palette={props.palette}>
        <h3 style={sectionTitleStyle(props.palette)}>Customer Switcher</h3>
        {memberships.length === 0 ? (
          <EmptyState palette={props.palette}>No customer memberships supplied.</EmptyState>
        ) : (
          <div style={{ display: "grid", gap: "6px", marginTop: "9px" }}>
            {memberships.map((membership, index) => {
              const active = isActiveCustomer(membership.customerId, customer?.activeCustomerId);
              return (
                <button
                  key={`${membership.customerId ?? index}`}
                  type="button"
                  disabled={!customer?.actions?.switchCustomer || active || actionPending !== null}
                  onClick={() => typeof membership.customerId !== "undefined" && switchCustomer(membership.customerId)}
                  style={{
                    ...buttonStyle(props.palette, active),
                    height: "auto",
                    justifyContent: "space-between",
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: "10px",
                    textAlign: "left",
                    padding: "8px 9px",
                    opacity: !customer?.actions?.switchCustomer && !active ? 0.5 : 1,
                  }}
                >
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {membershipLabel(membership)}
                  </span>
                  <span style={{ fontFamily: MONO_FONT }}>
                    {active ? "active" : membership.customerId ?? "n/a"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "10px" }}>
        <Panel palette={props.palette}>
          <h3 style={sectionTitleStyle(props.palette)}>Sign In Test</h3>
          <form onSubmit={submitSignIn} style={{ display: "grid", gap: "7px", marginTop: "9px" }}>
            <input
              type="email"
              value={signInEmail}
              placeholder="developer@example.com"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSignInEmail(event.currentTarget.value ?? "")}
              style={inputStyle(props.palette)}
            />
            <input
              type="password"
              value={signInPassword}
              placeholder="Password"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSignInPassword(event.currentTarget.value ?? "")}
              style={inputStyle(props.palette)}
            />
            <button
              type="submit"
              disabled={!auth?.actions?.signIn || actionPending !== null}
              style={{ ...buttonStyle(props.palette), opacity: !auth?.actions?.signIn ? 0.5 : 1 }}
            >
              {actionPending === "sign-in" ? "Signing in..." : "Sign In"}
            </button>
          </form>
          {!auth?.actions?.signIn && (
            <p style={mutedTextStyle(props.palette)}>Wire `auth.actions.signIn` to enable browser sign-in from the debug bar.</p>
          )}
        </Panel>

        <Panel palette={props.palette}>
          <h3 style={sectionTitleStyle(props.palette)}>Spoof User</h3>
          <form onSubmit={submitSpoof} style={{ display: "grid", gap: "7px", marginTop: "9px" }}>
            <input
              type="text"
              value={spoofUserId}
              placeholder="User ID"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSpoofUserId(event.currentTarget.value ?? "")}
              style={inputStyle(props.palette)}
            />
            <input
              type="email"
              value={spoofEmail}
              placeholder="Email"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSpoofEmail(event.currentTarget.value ?? "")}
              style={inputStyle(props.palette)}
            />
            <input
              type="text"
              value={spoofCustomerId}
              placeholder="Customer ID"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSpoofCustomerId(event.currentTarget.value ?? "")}
              style={inputStyle(props.palette)}
            />
            <button
              type="submit"
              disabled={!auth?.actions?.spoofUser || actionPending !== null}
              style={{ ...buttonStyle(props.palette), opacity: !auth?.actions?.spoofUser ? 0.5 : 1 }}
            >
              {actionPending === "spoof" ? "Spoofing..." : "Impersonate"}
            </button>
          </form>
          {!auth?.actions?.spoofUser && (
            <p style={mutedTextStyle(props.palette)}>
              Impersonation needs an app-owned dev route. The bar only calls the callback you provide.
            </p>
          )}
        </Panel>
      </div>

      {auth?.mfaMethods && auth.mfaMethods.length > 0 && (
        <Panel palette={props.palette}>
          <h3 style={sectionTitleStyle(props.palette)}>MFA Methods</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "9px" }}>
            {auth.mfaMethods.map((method) => (
              <span key={method.method} style={pillStyle(props.palette, method.isEnabled ? "success" : "default")}>
                {method.method}{method.verifiedAt ? ` verified ${formatDateTime(method.verifiedAt)}` : ""}
              </span>
            ))}
          </div>
        </Panel>
      )}

      <JsonPanel title="Auth details" value={auth?.details} palette={props.palette} />
      <JsonPanel title="Customer details" value={customer?.details} palette={props.palette} />
    </div>
  );
}
