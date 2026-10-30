"use client";

import type { ReactNode } from "react";

import {
  OminityCustomerAccountsProvider,
  type OminityCustomerAccountsProviderProps,
} from "../customer-accounts/react.js";
import { OminityDebugProvider } from "../debug/context.js";
import type { OminityDebugSnapshot } from "../debug/types.js";
import { TrackingProvider, type TrackingProviderProps } from "../next/tracking-provider.js";
import type { OminityBrowserSdkOptions } from "../sdk/client.js";
import { OminitySdkProvider } from "../sdk/react.js";
import { OminityAuthStateProvider, useAuth } from "./auth.js";
import { OminityCartProvider, OminityWishlistProvider } from "./cart.js";

export interface OminityProviderProps {
  readonly children: ReactNode;
  /** The browser SDK behind `useOminitySdk` and the account hooks; read once. */
  readonly sdk?: OminityBrowserSdkOptions | undefined;
  /** Where the auth routes are mounted. Defaults to `/api/auth`. */
  readonly authBasePath?: string | undefined;
  /** Where the cart and checkout routes are mounted. Defaults to `/api/commerce`. */
  readonly commerceBasePath?: string | undefined;
  readonly customerAccounts?: Omit<OminityCustomerAccountsProviderProps, "children"> | undefined;
  readonly wishlistStorageKey?: string | undefined;
  /** Visitor tracking through `/api/events`; the signed-in user is added automatically. Off by default. */
  readonly tracking?: (Omit<TrackingProviderProps, "children" | "userId"> & { readonly enabled: boolean }) | undefined;
  readonly devTool?: { readonly enabled: boolean; readonly snapshot?: OminityDebugSnapshot | undefined } | undefined;
}

function Tracking({ children, options }: { readonly children: ReactNode; readonly options: NonNullable<OminityProviderProps["tracking"]> }) {
  const auth = useAuth();
  return (
    <TrackingProvider
      endpoint="/api/events"
      {...options}
      {...(auth.user ? { userId: auth.user.id } : {})}
      extraMetadata={{
        ...(typeof options.extraMetadata === "object" ? options.extraMetadata : {}),
        auth_state: auth.user ? "authenticated" : "anonymous",
      }}
    >
      {children}
    </TrackingProvider>
  );
}

/**
 * Everything the hooks need, once at the root of the app:
 *
 * ```tsx
 * <OminityProvider tracking={{ enabled: true }}>{children}</OminityProvider>
 * ```
 *
 * Then use `useAuth`, `useUser`, `useCustomer`, `usePermission`, `useCart`, `useCheckout`, `useWishlist`,
 * `useOrders`, `useInvoices`, `useSubscriptions`, `useAddresses` and the SDK itself through `useOminitySdk`.
 */
export function OminityProvider(props: OminityProviderProps) {
  const app = (
    <OminitySdkProvider options={props.sdk}>
      <OminityAuthStateProvider options={{ basePath: props.authBasePath }}>
        <OminityCustomerAccountsProvider {...props.customerAccounts}>
          <OminityCartProvider basePath={props.commerceBasePath}>
            <OminityWishlistProvider storageKey={props.wishlistStorageKey}>
              {props.tracking?.enabled ? <Tracking options={props.tracking}>{props.children}</Tracking> : props.children}
            </OminityWishlistProvider>
          </OminityCartProvider>
        </OminityCustomerAccountsProvider>
      </OminityAuthStateProvider>
    </OminitySdkProvider>
  );

  return props.devTool
    ? (
      <OminityDebugProvider enabled={props.devTool.enabled} {...(props.devTool.snapshot ? { initialSnapshot: props.devTool.snapshot } : {})}>
        {app}
      </OminityDebugProvider>
    )
    : app;
}
