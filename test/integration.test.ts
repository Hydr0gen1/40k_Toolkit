import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Store } from "../src/store.js";
import { createApp } from "../src/server.js";
import { passwordHash } from "../src/auth.js";
import { fixture, roster } from "./fixtures.js";

test("OAuth and two MCP clients complete lookup, validate, compare and calculate", async () => {
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const port = (probe.address() as any).port;
  await new Promise<void>((r) => probe.close(() => r()));
  const base = `http://127.0.0.1:${port}`,
    callback = "http://127.0.0.1:9999/callback";
  const store = new Store(":memory:");
  store.activate(fixture());
  const password = "test-password-" + randomBytes(12).toString("hex");
  const { app } = createApp(store, {
    baseUrl: base,
    ownerPasswordHash: await passwordHash(password),
    callbackOrigins: ["http://127.0.0.1:9999"],
    trustProxy: false,
  });
  const http = app.listen(port, "127.0.0.1");
  const clients: Client[] = [];
  const post = (path: string, body: unknown, cookie?: string) =>
    fetch(base + path, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type":
          typeof body === "string"
            ? "application/x-www-form-urlencoded"
            : "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  try {
    assert.equal((await fetch(base + "/healthz")).status, 200);
    assert.equal((await fetch(base + "/readyz")).status, 200);
    const unauth = await post("/mcp", {});
    assert.equal(unauth.status, 401);
    assert.match(
      unauth.headers.get("www-authenticate") ?? "",
      /resource_metadata/,
    );
    const metadata = (await (
      await fetch(base + "/.well-known/oauth-authorization-server")
    ).json()) as any;
    assert.equal(metadata.issuer, base + "/");
    const bad = await post("/register", {
      redirect_uris: ["https://attacker.example/callback"],
      token_endpoint_auth_method: "none",
    });
    assert.equal(bad.status, 400);
    const reg = await post("/register", {
      redirect_uris: [callback],
      client_name: "Test assistant",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "toolkit:read",
    });
    assert.equal(reg.status, 201);
    const client = (await reg.json()) as any;
    const verifier = randomBytes(32).toString("base64url"),
      challenge = createHash("sha256").update(verifier).digest("base64url");
    const params = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: callback,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "toolkit:read",
      resource: base + "/mcp",
      state: "test-state",
    });
    const authorize = await fetch(base + "/authorize?" + params, {
      redirect: "manual",
    });
    assert.equal(authorize.status, 200);
    const html = await authorize.text();
    const request = html.match(/name="request" value="([^"]+)"/)![1];
    const cookie = authorize.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (
        await post(
          "/login",
          new URLSearchParams({ request, password }).toString(),
        )
      ).status,
      400,
    );
    const login = await post(
      "/login",
      new URLSearchParams({ request, password }).toString(),
      cookie,
    );
    assert.equal(login.status, 302);
    const redirect = new URL(login.headers.get("location")!);
    assert.equal(redirect.searchParams.get("state"), "test-state");
    const code = redirect.searchParams.get("code")!;
    const tokenBody = {
      grant_type: "authorization_code",
      client_id: client.client_id,
      code,
      code_verifier: verifier,
      redirect_uri: callback,
      resource: base + "/mcp",
    };
    const wrong = await post(
      "/token",
      new URLSearchParams({
        ...tokenBody,
        code_verifier: "a".repeat(43),
      }).toString(),
    );
    assert.equal(wrong.status, 400);
    const wrongResource = await post(
      "/token",
      new URLSearchParams({
        ...tokenBody,
        resource: "https://other.example/mcp",
      }).toString(),
    );
    assert.equal(wrongResource.status, 400);
    const exchange = await post(
      "/token",
      new URLSearchParams(tokenBody).toString(),
    );
    assert.equal(exchange.status, 200);
    const tokens = (await exchange.json()) as any;
    assert.equal(
      (await post("/token", new URLSearchParams(tokenBody).toString())).status,
      400,
    );
    for (const name of [
      "chatgpt-compatible-client",
      "claude-compatible-client",
    ]) {
      const c = new Client({ name, version: "test" });
      clients.push(c);
      await c.connect(
        new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
          requestInit: {
            headers: { Authorization: "Bearer " + tokens.access_token },
          },
        }),
      );
      const tools = await c.listTools();
      assert.equal(tools.tools.length, 7);
      const status = await c.callTool({
        name: "get_data_status",
        arguments: {},
      });
      assert.equal(
        (status.structuredContent as any).activeSnapshot.id,
        "test-snapshot",
      );
      const unit = await c.callTool({
        name: "get_unit",
        arguments: { query: "Test Captain", snapshotId: "test-snapshot" },
      });
      assert.equal((unit.structuredContent as any).units.length, 1);
      for (const size of [1000, 2000] as const) {
        const r = roster(size);
        const valid = await c.callTool({
          name: "validate_list",
          arguments: { roster: r },
        });
        assert.equal((valid.structuredContent as any).status, "valid");
        const comparison = await c.callTool({
          name: "compare_lists",
          arguments: { rosters: [r, { ...r, name: "Second candidate" }] },
        });
        assert.equal((comparison.structuredContent as any).comparable, true);
      }
      const combat = await c.callTool({
        name: "calculate_combat",
        arguments: {
          trials: 1000,
          defender: { models: 1, wounds: 1, toughness: 4, save: 7 },
          weapons: [
            {
              name: "Test",
              models: 1,
              attacks: 1,
              skill: 4,
              strength: 4,
              ap: 0,
              damage: 1,
            },
          ],
        },
      });
      assert.equal((combat.structuredContent as any).status, "calculated");
      const evidence = await c.callTool({
        name: "search_tournament_evidence",
        arguments: { pointsLimit: 1000 },
      });
      assert.equal((evidence.structuredContent as any).coverage.sparse, true);
    }
    const refreshed = await post(
      "/token",
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: client.client_id,
        refresh_token: tokens.refresh_token,
        resource: base + "/mcp",
      }).toString(),
    );
    assert.equal(refreshed.status, 200);
    const newer = (await refreshed.json()) as any;
    assert.equal(
      (
        await post(
          "/token",
          new URLSearchParams({
            grant_type: "refresh_token",
            client_id: client.client_id,
            refresh_token: tokens.refresh_token,
          }).toString(),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await post(
          "/revoke",
          new URLSearchParams({
            client_id: client.client_id,
            token: newer.refresh_token,
          }).toString(),
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(base + "/mcp", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + newer.access_token,
            "content-type": "application/json",
          },
          body: "{}",
        })
      ).status,
      401,
    );
  } finally {
    for (const c of clients) await c.close();
    await new Promise<void>((r) => http.close(() => r()));
    store.close();
  }
});
