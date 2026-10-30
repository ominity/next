// Test stand-in for `next/headers`: route handlers read cookies from `globalThis.__ominityTestCookies`.
export async function cookies() {
  const store = globalThis.__ominityTestCookies;
  if (!store) throw new Error("Set globalThis.__ominityTestCookies before calling a route that reads cookies.");
  return store;
}

export async function headers() {
  return new Headers();
}

export async function draftMode() {
  return { isEnabled: false, enable() {}, disable() {} };
}
