import assert from "node:assert/strict";
import test from "node:test";
import pack from "./index.js";

test("exports the AdsPower Step Pack", () => {
  assert.equal(pack.kind, "step-pack");
  assert.equal(pack.version, 1);
  assert.equal(pack.id, "adspower/core");
  assert.deepEqual(pack.steps.map((step) => step.id), ["adspower/create-browser"]);
});

test("supports direct and Browser Gateway API transports", async () => {
  const definition = pack.steps[0];
  assert.ok(definition);
  const originalFetch = globalThis.fetch;
  const calls: Array<{ headers: Headers; url: string }> = [];
  const responses = [
    { code: 0, data: { list: [] } },
    { code: 0, data: { profile_id: "direct-profile", profile_no: 7 } },
    {
      code: 0,
      data: {
        debug_port: "9222",
        ws: { puppeteer: "ws://direct/devtools/browser/1" },
      },
    },
    { code: 0, data: { list: [] } },
    { code: 0, data: { profile_id: "gateway-profile" } },
    { code: 0, data: { ws: { puppeteer: "ws://gateway/devtools/browser/2" } } },
  ];
  globalThis.fetch = async (input, init) => {
    calls.push({
      headers: new Headers(init?.headers),
      url: String(input),
    });
    return Response.json(responses.shift());
  };

  try {
    const signal = new AbortController().signal;
    const direct = await definition.run({
      input: definition.normalizeInput({
        apiKey: "secret",
        apiUrl: "http://127.0.0.1:50325/",
        name: "direct",
      }, "step.adspower/create-browser.input"),
      resources: {},
      signal,
    });
    const gateway = await definition.run({
      input: definition.normalizeInput({
        apiUrl: "http://127.0.0.1:50325/",
        browserGatewayUrl: "http://127.0.0.1:9335/",
        name: "gateway",
      }, "step.adspower/create-browser.input"),
      resources: {},
      signal,
    });

    assert.equal(direct.status, "succeeded");
    assert.equal(direct.outputs.browserGatewayUrl, "");
    assert.equal(direct.outputs.debugPort, 9222);
    assert.equal(direct.outputs.profileNo, "7");
    assert.equal(gateway.status, "succeeded");
    assert.equal(gateway.outputs.browserGatewayUrl, "http://127.0.0.1:9335");
    assert.equal(calls[0]?.url, "http://127.0.0.1:50325/api/v2/browser-profile/list");
    assert.equal(calls[0]?.headers.get("authorization"), "Bearer secret");
    assert.equal(calls[0]?.headers.has("x-browser-gateway-upstream"), false);
    assert.equal(calls[3]?.url, "http://127.0.0.1:9335/api/v2/browser-profile/list");
    assert.equal(
      calls[3]?.headers.get("x-browser-gateway-upstream"),
      "http://127.0.0.1:50325",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns a non-retryable structured error for invalid URLs", async () => {
  const definition = pack.steps[0];
  assert.ok(definition);
  const result = await definition.run({
    input: definition.normalizeInput({
      apiUrl: "file:///tmp/adspower",
      name: "invalid",
    }, "step.adspower/create-browser.input"),
    resources: {},
    signal: new AbortController().signal,
  });

  assert.deepEqual(result, {
    status: "failed",
    error: {
      code: "adspower-invalid-url",
      message: "AdsPower request URL must use HTTP or HTTPS: file:///tmp/adspower",
      retryable: false,
    },
    outputs: {},
  });
});

test("stops and deletes every profile with the requested name", async () => {
  const definition = pack.steps[0];
  assert.ok(definition);
  const originalFetch = globalThis.fetch;
  const requests: Array<{ body: unknown; path: string }> = [];
  const responses = [
    {
      code: 0,
      data: {
        list: [
          { name: "single-use", profile_id: "old-1" },
          { name: "keep", profile_id: "keep-1" },
          { name: "single-use", profile_id: "old-2" },
        ],
      },
    },
    { code: 0 },
    { code: 0 },
    { code: 0 },
    { code: 0, data: { profile_id: "new-1" } },
    { code: 0, data: { ws: { puppeteer: "ws://new/devtools/browser/3" } } },
  ];
  globalThis.fetch = async (input, init) => {
    requests.push({
      body: JSON.parse(String(init?.body)),
      path: new URL(String(input)).pathname,
    });
    return Response.json(responses.shift());
  };

  try {
    const result = await definition.run({
      input: definition.normalizeInput({
        apiUrl: "http://127.0.0.1:50325",
        name: "single-use",
      }, "step.adspower/create-browser.input"),
      resources: {},
      signal: new AbortController().signal,
    });

    assert.equal(result.status, "succeeded");
    assert.equal(result.outputs.removedProfileCount, 2);
    assert.deepEqual(requests.slice(1, 3), [
      {
        body: { profile_id: "old-1" },
        path: "/api/v2/browser-profile/stop",
      },
      {
        body: { profile_id: "old-2" },
        path: "/api/v2/browser-profile/stop",
      },
    ]);
    assert.deepEqual(requests[3], {
      body: { profile_id: ["old-1", "old-2"] },
      path: "/api/v2/browser-profile/delete",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
