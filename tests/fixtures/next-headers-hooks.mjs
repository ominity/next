export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/headers") {
    return { url: new URL("./next-headers.mjs", import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
