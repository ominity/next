import assert from "node:assert/strict";
import { test } from "node:test";

import { Window } from "happy-dom";

const window = new Window({ url: "https://store.example.com/account" });
globalThis.window = window;
globalThis.document = window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const {
  OminitySdkProvider,
  useOminitySdkMutation,
  useOminitySdkPaginatedQuery,
  useOminitySdkQuery,
} = await import("../dist/sdk/react.js");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Renders a hook inside an `OminitySdkProvider` with a stand-in SDK; returns its latest result. */
async function renderHook(sdk, useHook, initialProps) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const state = { current: undefined };
  function Probe({ props }) {
    state.current = useHook(props);
    return null;
  }
  const render = (props) => act(async () => {
    root.render(React.createElement(OminitySdkProvider, { sdk }, React.createElement(Probe, { props })));
  });
  await render(initialProps);
  return {
    get result() {
      return state.current;
    },
    rerender: render,
    unmount: () => act(async () => root.unmount()),
  };
}

const settle = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

function page(items, pageNumber, totalPages) {
  return {
    items,
    count: totalPages * 2,
    page: pageNumber,
    limit: 2,
    totalPages,
    hasNext: pageNumber < totalPages,
    hasPrevious: pageNumber > 1,
  };
}

test("queries load through the SDK, reload on a new key and never return the previous key's data", async () => {
  const pending = new Map();
  const sdk = {
    products: {
      get: ({ id }, { signal }) => {
        assert.equal(signal instanceof window.AbortSignal || signal instanceof AbortSignal, true);
        const request = deferred();
        pending.set(id, request);
        return request.promise;
      },
    },
  };
  const hook = await renderHook(sdk, ({ id }) => useOminitySdkQuery(
    (client, { signal }) => client.products.get({ id }, { signal }),
    { key: [id] },
  ), { id: 1 });

  assert.equal(hook.result.loading, true);
  assert.equal(hook.result.data, undefined);
  await act(async () => pending.get(1).resolve({ id: 1, title: "One" }));
  assert.equal(hook.result.loading, false);
  assert.deepEqual(hook.result.data, { id: 1, title: "One" });

  await hook.rerender({ id: 2 });
  assert.equal(hook.result.data, undefined, "product 1 is not shown as product 2");
  assert.equal(hook.result.loading, true);
  await act(async () => pending.get(2).resolve({ id: 2, title: "Two" }));
  assert.deepEqual(hook.result.data, { id: 2, title: "Two" });
  await hook.unmount();
});

test("query failures become structured errors with the API's reason code", async () => {
  const sdk = {
    fail: async () => {
      throw Object.assign(new Error("Not allowed"), { status: 403, code: "ROUTE_NOT_ALLOWED" });
    },
  };
  const hook = await renderHook(sdk, () => useOminitySdkQuery((client) => client.fail()));
  await settle();

  assert.equal(hook.result.loading, false);
  assert.equal(hook.result.ready, true);
  assert.equal(hook.result.error?.status, 403);
  assert.equal(hook.result.error?.code, "ROUTE_NOT_ALLOWED");
  await hook.unmount();
});

test("paginated queries move between pages and keep the current page while the next one loads", async () => {
  const requests = [];
  const sdk = {
    list: ({ page: pageNumber, limit }) => {
      const request = deferred();
      requests.push({ page: pageNumber, limit, request });
      return request.promise;
    },
  };
  const hook = await renderHook(sdk, () => useOminitySdkPaginatedQuery(
    (client, { page: pageNumber, limit }) => client.list({ page: pageNumber, limit }),
    { pageSize: 2 },
  ));

  assert.deepEqual(requests.map(({ page: p, limit }) => [p, limit]), [[1, 2]]);
  await act(async () => requests[0].request.resolve(page(["a", "b"], 1, 2)));
  assert.deepEqual(hook.result.items, ["a", "b"]);
  assert.equal(hook.result.hasNext, true);
  assert.equal(hook.result.totalPages, 2);

  await act(async () => hook.result.next());
  assert.equal(hook.result.page, 2);
  assert.equal(hook.result.loading, true);
  assert.deepEqual(hook.result.items, ["a", "b"], "page 1 stays visible while page 2 loads");
  await act(async () => requests[1].request.resolve(page(["c", "d"], 2, 2)));
  assert.deepEqual(hook.result.items, ["c", "d"]);
  assert.equal(hook.result.hasNext, false);
  assert.equal(hook.result.hasPrevious, true);

  await act(async () => hook.result.next());
  assert.equal(requests.length, 2, "no request past the last page");
  await act(async () => hook.result.previous());
  assert.equal(requests.at(-1).page, 1);
  await hook.unmount();
});

test("append mode accumulates pages, and a new key starts again without the old items", async () => {
  const requests = [];
  const sdk = {
    list: ({ customerId, page: pageNumber }) => {
      const request = deferred();
      requests.push({ customerId, page: pageNumber, request });
      return request.promise;
    },
  };
  const hook = await renderHook(sdk, ({ customerId }) => useOminitySdkPaginatedQuery(
    (client, { page: pageNumber }) => client.list({ customerId, page: pageNumber }),
    { key: [customerId], mode: "append", pageSize: 2 },
  ), { customerId: 42 });

  await act(async () => requests[0].request.resolve(page(["a", "b"], 1, 3)));
  await act(async () => hook.result.loadMore());
  assert.equal(hook.result.loadingMore, true);
  assert.deepEqual(hook.result.items, ["a", "b"]);
  await act(async () => requests[1].request.resolve(page(["c", "d"], 2, 3)));
  assert.deepEqual(hook.result.items, ["a", "b", "c", "d"]);
  assert.equal(hook.result.loadingMore, false);

  await hook.rerender({ customerId: 43 });
  assert.deepEqual(hook.result.items, [], "customer 42's orders are gone as soon as the customer changes");
  assert.equal(hook.result.page, 1);
  assert.deepEqual([requests.at(-1).customerId, requests.at(-1).page], [43, 1]);
  await act(async () => requests.at(-1).request.resolve(page(["x"], 1, 1)));
  assert.deepEqual(hook.result.items, ["x"]);

  await act(async () => hook.result.refresh());
  assert.deepEqual([requests.at(-1).customerId, requests.at(-1).page], [43, 1]);
  await act(async () => requests.at(-1).request.resolve(page(["y"], 1, 1)));
  assert.deepEqual(hook.result.items, ["y"], "refresh starts the list again");
  await hook.unmount();
});

test("mutations expose pending state, the result, and structured errors", async () => {
  const calls = [];
  const sdk = {
    quote: async (input) => {
      calls.push(input);
      if (input.toOfferId === 0) {
        throw Object.assign(new Error("Refused"), { status: 422, code: "subscription.change_not_allowed" });
      }
      return { id: "chg-1", toOfferId: input.toOfferId };
    },
  };
  const successes = [];
  const hook = await renderHook(sdk, () => useOminitySdkMutation(
    (client, toOfferId) => client.quote({ toOfferId }),
    { onSuccess: (result) => successes.push(result.id) },
  ));

  let result;
  await act(async () => {
    result = await hook.result.execute(12);
  });
  assert.deepEqual(result, { id: "chg-1", toOfferId: 12 });
  assert.deepEqual(hook.result.data, { id: "chg-1", toOfferId: 12 });
  assert.equal(hook.result.pending, false);
  assert.deepEqual(successes, ["chg-1"]);

  await act(async () => {
    await hook.result.execute(0).catch(() => undefined);
  });
  assert.equal(hook.result.error?.code, "subscription.change_not_allowed");
  assert.equal(hook.result.error?.status, 422);
  await hook.unmount();
});
