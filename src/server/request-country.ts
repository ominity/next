type MaybePromise<T> = T | Promise<T>;

export interface OminityRequestCountryRouteOptions {
  readonly resolveCountry: (request: Request) => MaybePromise<string | undefined | null>;
  readonly cacheControl?: string;
}

export function createOminityRequestCountryRouteHandlers(
  options: OminityRequestCountryRouteOptions,
): {
  readonly GET: (request: Request) => Promise<Response>;
} {
  return {
    async GET(request: Request): Promise<Response> {
      const country = await options.resolveCountry(request);

      return Response.json(
        typeof country === "string" && country.length > 0
          ? { country }
          : { country: null },
        {
          headers: {
            "Cache-Control": options.cacheControl ?? "no-store",
          },
        },
      );
    },
  };
}
