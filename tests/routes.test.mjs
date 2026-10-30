import assert from "node:assert/strict";
import { test } from "node:test";

import { createOminityRouteHandlers } from "../dist/routes/index.js";

const SITE = "https://store.example.com";
const request = (path, init) => new Request(`${SITE}${path}`, init);

test("one catch-all serves every package route on its usual path", async () => {
  const routes = createOminityRouteHandlers({
    ominityBaseUrl: "https://tenant.ominity.test/api",
    siteUrl: SITE,
    devTool: true,
  });

  const gateway = await routes.GET(request("/api/ominity/v1/commerce/orders"));
  assert.equal(gateway.status, 403);
  assert.equal((await gateway.json()).code, "ROUTE_NOT_ALLOWED");

  const accounts = await routes.POST(request("/api/customer-accounts/switch", {
    method: "POST",
    headers: { Origin: "https://attacker.example" },
    body: "{}",
  }));
  assert.equal(accounts.status, 403);
  assert.equal((await accounts.json()).code, "INVALID_ORIGIN");

  const devTool = await routes.GET(request("/api/dev-tool/requests"));
  assert.equal(devTool.status, 200);

  const wrongMethod = await routes.GET(request("/api/auth/login"));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST");

  assert.equal((await routes.GET(request("/api/unknown"))).status, 404);
  assert.equal((await routes.GET(request("/elsewhere/auth/me"))).status, 404);
});

test("features can be switched off and the base path moved", async () => {
  const routes = createOminityRouteHandlers({
    basePath: "/backend",
    siteUrl: SITE,
    sdkGateway: false,
    customerAccounts: false,
  });

  assert.equal((await routes.GET(request("/backend/ominity/v1/me"))).status, 404);
  assert.equal((await routes.POST(request("/backend/customer-accounts/switch", { method: "POST", body: "{}" }))).status, 404);
  assert.equal((await routes.GET(request("/backend/dev-tool/requests"))).status, 404, "the dev tool is off unless enabled");
  assert.equal((await routes.PUT(request("/backend/auth/me", { method: "PUT" }))).status, 405);
});
