import type {
  CommerceCart,
  CommerceCartItem,
  CommerceClient,
} from "../commerce/types.js";
import {
  readCartIdCookie,
  writeCartIdCookie,
  type CartCookieOptions,
  type CommerceCookieReader,
  type CommerceCookieWriter,
} from "./commerce.js";

type UnknownRecord = Readonly<Record<string, unknown>>;

export interface CommerceCartSnapshot {
  readonly cart: CommerceCart;
  readonly items: ReadonlyArray<CommerceCartItem>;
  readonly created: boolean;
}

export interface GetOrCreateCommerceCartSnapshotInput {
  readonly client: CommerceClient;
  readonly cookies: CommerceCookieReader & CommerceCookieWriter;
  readonly cookieOptions?: CartCookieOptions;
  readonly createCartData?: Readonly<Record<string, unknown>>;
  readonly cartInclude?: string;
  readonly itemsInclude?: string;
}

export interface RefreshCommerceCartSnapshotInput {
  readonly client: CommerceClient;
  readonly cookies: CommerceCookieReader & CommerceCookieWriter;
  readonly cookieOptions?: CartCookieOptions;
  readonly cartInclude?: string;
  readonly itemsInclude?: string;
}

export interface UpdateCommerceCartAndRefreshInput {
  readonly client: CommerceClient;
  readonly cookies: CommerceCookieReader & CommerceCookieWriter;
  readonly cookieOptions?: CartCookieOptions;
  readonly createCartData?: UnknownRecord;
  readonly cartInclude?: string;
  readonly itemsInclude?: string;
  readonly data: UnknownRecord;
}

export interface CreateCommerceCartItemAndRefreshInput {
  readonly client: CommerceClient;
  readonly cookies: CommerceCookieReader & CommerceCookieWriter;
  readonly cookieOptions?: CartCookieOptions;
  readonly createCartData?: UnknownRecord;
  readonly cartInclude?: string;
  readonly itemsInclude?: string;
  readonly productId: string;
  readonly quantity?: number;
  readonly data?: UnknownRecord;
}

export interface UpdateCommerceCartItemAndRefreshInput {
  readonly client: CommerceClient;
  readonly cookies: CommerceCookieReader & CommerceCookieWriter;
  readonly cookieOptions?: CartCookieOptions;
  readonly createCartData?: UnknownRecord;
  readonly cartInclude?: string;
  readonly itemsInclude?: string;
  readonly itemId: string;
  readonly data: UnknownRecord;
}

export interface SetCommerceCartItemQuantityAndRefreshInput {
  readonly client: CommerceClient;
  readonly cookies: CommerceCookieReader & CommerceCookieWriter;
  readonly cookieOptions?: CartCookieOptions;
  readonly createCartData?: UnknownRecord;
  readonly cartInclude?: string;
  readonly itemsInclude?: string;
  readonly itemId: string;
  readonly quantity: number;
}

export interface DeleteCommerceCartItemAndRefreshInput {
  readonly client: CommerceClient;
  readonly cookies: CommerceCookieReader & CommerceCookieWriter;
  readonly cookieOptions?: CartCookieOptions;
  readonly createCartData?: UnknownRecord;
  readonly cartInclude?: string;
  readonly itemsInclude?: string;
  readonly itemId: string;
}

export interface SetCommercePromotionCodesAndRefreshInput {
  readonly client: CommerceClient;
  readonly cookies: CommerceCookieReader & CommerceCookieWriter;
  readonly cookieOptions?: CartCookieOptions;
  readonly createCartData?: UnknownRecord;
  readonly cartInclude?: string;
  readonly itemsInclude?: string;
  readonly promotionCodes: ReadonlyArray<string>;
}

type MutationInputWithCartData = {
  readonly client: CommerceClient;
  readonly cookies: CommerceCookieReader & CommerceCookieWriter;
  readonly cookieOptions?: CartCookieOptions;
  readonly createCartData?: UnknownRecord;
  readonly cartInclude?: string;
  readonly itemsInclude?: string;
};

function normalizePositiveQuantity(quantity: number | undefined): number {
  if (!Number.isFinite(quantity)) {
    return 1;
  }

  const normalized = Math.floor(quantity as number);
  return normalized > 0 ? normalized : 1;
}

function normalizePromotionCodes(value: ReadonlyArray<string>): ReadonlyArray<string> {
  const normalized: string[] = [];
  for (const entry of value) {
    const trimmed = entry.trim();
    if (trimmed.length > 0 && !normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  }

  return normalized;
}

function asGetOrCreateInput(
  input: MutationInputWithCartData,
): GetOrCreateCommerceCartSnapshotInput {
  return {
    client: input.client,
    cookies: input.cookies,
    ...(input.cookieOptions ? { cookieOptions: input.cookieOptions } : {}),
    ...(input.createCartData ? { createCartData: input.createCartData } : {}),
    ...(typeof input.cartInclude === "string" ? { cartInclude: input.cartInclude } : {}),
    ...(typeof input.itemsInclude === "string" ? { itemsInclude: input.itemsInclude } : {}),
  };
}

function asRefreshInput(
  input: MutationInputWithCartData,
): RefreshCommerceCartSnapshotInput {
  return {
    client: input.client,
    cookies: input.cookies,
    ...(input.cookieOptions ? { cookieOptions: input.cookieOptions } : {}),
    ...(typeof input.cartInclude === "string" ? { cartInclude: input.cartInclude } : {}),
    ...(typeof input.itemsInclude === "string" ? { itemsInclude: input.itemsInclude } : {}),
  };
}

async function refreshOrCreateCartSnapshot(
  input: MutationInputWithCartData,
): Promise<CommerceCartSnapshot> {
  const refreshed = await refreshCommerceCartSnapshot(asRefreshInput(input));
  if (refreshed) {
    return refreshed;
  }

  return getOrCreateCommerceCartSnapshot(asGetOrCreateInput(input));
}

export async function getOrCreateCommerceCartSnapshot(
  input: GetOrCreateCommerceCartSnapshotInput,
): Promise<CommerceCartSnapshot> {
  let created = false;
  const existingCartId = readCartIdCookie(input.cookies, input.cookieOptions);
  let cart: CommerceCart | null = null;

  if (typeof existingCartId === "string" && existingCartId.length > 0) {
    cart = await input.client.getCart({
      cartId: existingCartId,
      ...(typeof input.cartInclude === "string" ? { include: input.cartInclude } : {}),
    });
  }

  if (!cart) {
    cart = await input.client.createCart({
      ...(input.createCartData ? { data: input.createCartData } : {}),
    });
    created = true;
  }

  writeCartIdCookie(input.cookies, cart.id, input.cookieOptions);
  const items = await input.client.listCartItems({
    cartId: cart.id,
    ...(typeof input.itemsInclude === "string" ? { include: input.itemsInclude } : {}),
  });

  return {
    cart,
    items,
    created,
  };
}

export async function refreshCommerceCartSnapshot(
  input: RefreshCommerceCartSnapshotInput,
): Promise<CommerceCartSnapshot | null> {
  const existingCartId = readCartIdCookie(input.cookies, input.cookieOptions);
  if (!existingCartId) {
    return null;
  }

  const cart = await input.client.getCart({
    cartId: existingCartId,
    ...(typeof input.cartInclude === "string" ? { include: input.cartInclude } : {}),
  });

  if (!cart) {
    return null;
  }

  writeCartIdCookie(input.cookies, cart.id, input.cookieOptions);
  const items = await input.client.listCartItems({
    cartId: cart.id,
    ...(typeof input.itemsInclude === "string" ? { include: input.itemsInclude } : {}),
  });

  return {
    cart,
    items,
    created: false,
  };
}

export async function updateCommerceCartAndRefresh(
  input: UpdateCommerceCartAndRefreshInput,
): Promise<CommerceCartSnapshot> {
  const snapshot = await getOrCreateCommerceCartSnapshot(asGetOrCreateInput(input));

  await input.client.updateCart({
    cartId: snapshot.cart.id,
    data: input.data,
  });

  return refreshOrCreateCartSnapshot(input);
}

export async function createCommerceCartItemAndRefresh(
  input: CreateCommerceCartItemAndRefreshInput,
): Promise<CommerceCartSnapshot> {
  const snapshot = await getOrCreateCommerceCartSnapshot(asGetOrCreateInput(input));

  await input.client.createCartItem({
    cartId: snapshot.cart.id,
    productId: input.productId,
    quantity: normalizePositiveQuantity(input.quantity),
    ...(input.data ? { data: input.data } : {}),
  });

  return refreshOrCreateCartSnapshot(input);
}

export async function updateCommerceCartItemAndRefresh(
  input: UpdateCommerceCartItemAndRefreshInput,
): Promise<CommerceCartSnapshot> {
  const snapshot = await getOrCreateCommerceCartSnapshot(asGetOrCreateInput(input));

  await input.client.updateCartItem({
    cartId: snapshot.cart.id,
    itemId: input.itemId,
    data: input.data,
  });

  return refreshOrCreateCartSnapshot(input);
}

export async function setCommerceCartItemQuantityAndRefresh(
  input: SetCommerceCartItemQuantityAndRefreshInput,
): Promise<CommerceCartSnapshot> {
  const snapshot = await getOrCreateCommerceCartSnapshot(asGetOrCreateInput(input));
  const quantity = Number.isFinite(input.quantity) ? Math.floor(input.quantity) : 1;

  if (quantity <= 0) {
    await input.client.deleteCartItem({
      cartId: snapshot.cart.id,
      itemId: input.itemId,
    });
  } else {
    await input.client.updateCartItem({
      cartId: snapshot.cart.id,
      itemId: input.itemId,
      data: {
        quantity,
      },
    });
  }

  return refreshOrCreateCartSnapshot(input);
}

export async function deleteCommerceCartItemAndRefresh(
  input: DeleteCommerceCartItemAndRefreshInput,
): Promise<CommerceCartSnapshot> {
  const snapshot = await getOrCreateCommerceCartSnapshot(asGetOrCreateInput(input));

  await input.client.deleteCartItem({
    cartId: snapshot.cart.id,
    itemId: input.itemId,
  });

  return refreshOrCreateCartSnapshot(input);
}

export async function setCommercePromotionCodesAndRefresh(
  input: SetCommercePromotionCodesAndRefreshInput,
): Promise<CommerceCartSnapshot> {
  const normalizedPromotionCodes = normalizePromotionCodes(input.promotionCodes);
  return updateCommerceCartAndRefresh({
    client: input.client,
    cookies: input.cookies,
    ...(input.cookieOptions ? { cookieOptions: input.cookieOptions } : {}),
    ...(input.createCartData ? { createCartData: input.createCartData } : {}),
    ...(typeof input.cartInclude === "string" ? { cartInclude: input.cartInclude } : {}),
    ...(typeof input.itemsInclude === "string" ? { itemsInclude: input.itemsInclude } : {}),
    data: {
      promotionCodes: normalizedPromotionCodes,
    },
  });
}
