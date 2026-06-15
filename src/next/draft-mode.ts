export interface ResolveDraftModeInput {
  readonly preview?: boolean;
  readonly useNextDraftMode?: boolean;
}

export interface OminityDraftRouteOptions {
  readonly draftToken?: string | undefined;
  readonly redirectQueryParam?: string | undefined;
  readonly secretQueryParam?: string | undefined;
  readonly disableQueryParam?: string | undefined;
}

async function readNextDraftModeState(): Promise<boolean> {
  const module = await import("next/headers");
  const draftModeState = await module.draftMode();
  return Boolean(draftModeState.isEnabled);
}

async function loadNextDraftModeController(): Promise<{
  enable: () => void;
  disable: () => void;
}> {
  const module = await import("next/headers");
  return module.draftMode();
}

export async function resolveDraftMode(input: ResolveDraftModeInput = {}): Promise<boolean> {
  if (typeof input.preview === "boolean") {
    return input.preview;
  }

  if (input.useNextDraftMode !== true) {
    return false;
  }

  try {
    return await readNextDraftModeState();
  } catch {
    return false;
  }
}

export function createOminityDraftRouteHandlers(options: OminityDraftRouteOptions): {
  readonly GET: (request: Request) => Promise<Response>;
} {
  const secretQueryParam = options.secretQueryParam ?? "secret";
  const disableQueryParam = options.disableQueryParam ?? "disable";
  const redirectQueryParam = options.redirectQueryParam ?? "slug";

  return {
    async GET(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const draftToken = options.draftToken?.trim();

      if (!draftToken) {
        return Response.json(
          {
            error: "Draft mode is not configured. Set OMINITY_DRAFT_TOKEN.",
          },
          { status: 400 },
        );
      }

      const secret = url.searchParams.get(secretQueryParam);
      if (secret !== draftToken) {
        return Response.json({ error: "Invalid draft token." }, { status: 401 });
      }

      const disable = url.searchParams.get(disableQueryParam) === "true";
      const redirectTo = url.searchParams.get(redirectQueryParam) ?? "/";
      const draftMode = await loadNextDraftModeController();

      if (disable) {
        draftMode.disable();
      } else {
        draftMode.enable();
      }

      return Response.redirect(new URL(redirectTo, request.url));
    },
  };
}
