import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { Express, Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  InvalidGrantError,
  InvalidTokenError,
  InvalidClientMetadataError,
  InvalidScopeError,
  InvalidTargetError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { rateLimit } from "express-rate-limit";
import { Store } from "./store.js";

const scryptAsync = promisify(scrypt);
const token = () => randomBytes(32).toString("base64url");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  return salt + ":" + key.toString("hex");
}
async function checkPassword(password: string, encoded: string) {
  const [salt, key] = encoded.split(":");
  if (!salt || !key || password.length > 512) return false;
  const actual = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(key, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
type Grant = {
  clientId: string;
  params: AuthorizationParams & { resource?: any };
  csrfHash: string;
};
type StoredToken = {
  clientId: string;
  scopes: string[];
  resource: string;
  expiresAt: number;
  family: string;
};

export class PersonalOAuth implements OAuthServerProvider {
  constructor(
    private store: Store,
    private base: string,
    private ownerHash: string,
    private callbackOrigins: string[],
  ) {}
  get resource() {
    return this.base + "/mcp";
  }
  clientsStore = {
    getClient: (id: string) =>
      this.store.getAuth<OAuthClientInformationFull>("client", id),
    registerClient: async (
      client: Omit<
        OAuthClientInformationFull,
        "client_id" | "client_id_issued_at"
      >,
    ): Promise<OAuthClientInformationFull> => {
      if (!client.redirect_uris.length || client.redirect_uris.length > 10)
        throw new InvalidClientMetadataError(
          "One to ten redirect URIs required",
        );
      for (const uri of client.redirect_uris) {
        const u = new URL(uri);
        if (
          !this.callbackOrigins.includes(u.origin) ||
          u.hash ||
          u.username ||
          u.password
        )
          throw new InvalidClientMetadataError(
            "Callback origin is not allowed by the owner",
          );
      }
      if (client.scope && client.scope !== "toolkit:read")
        throw new InvalidScopeError("Only toolkit:read is supported");
      const result = {
        ...client,
        client_id: randomUUID(),
        client_id_issued_at: Math.floor(Date.now() / 1000),
      };
      this.store.setAuth(
        "client",
        result.client_id,
        result,
        Date.now() + 365 * 86400000,
      );
      return result;
    },
  };
  private checkResource(resource?: URL) {
    if (resource && resource.toString() !== this.resource)
      throw new InvalidTargetError("Resource must be this server MCP URL");
  }
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ) {
    this.checkResource(params.resource);
    if (params.scopes?.some((s) => s !== "toolkit:read"))
      throw new InvalidScopeError("Only toolkit:read is supported");
    const id = token(),
      csrf = token();
    this.store.setAuth(
      "pending",
      hash(id),
      {
        clientId: client.client_id,
        params: { ...params, resource: params.resource?.toString() },
        csrfHash: hash(csrf),
      },
      Date.now() + 600000,
    );
    res.cookie("bt_authorization", csrf, {
      httpOnly: true,
      secure: this.base.startsWith("https:"),
      sameSite: "lax",
      path: "/login",
      maxAge: 600000,
    });
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res
      .type("html")
      .send(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect Black Templars Toolkit</title><body><main><h1>Connect your toolkit</h1><p>Authorize ${escape(client.client_name ?? "your AI assistant")} to read rules and run list and combat calculations.</p><p>Callback: ${escape(new URL(params.redirectUri).origin)}</p><form method="post" action="/login"><input type="hidden" name="request" value="${id}"><label>Owner password <input name="password" type="password" required autocomplete="current-password" maxlength="512"></label><button type="submit">Authorize connection</button></form></main></body></html>`,
      );
  }
  installLogin(app: Express) {
    app.post(
      "/login",
      rateLimit({
        windowMs: 15 * 60000,
        limit: 15,
        standardHeaders: "draft-7",
        legacyHeaders: false,
      }),
      async (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        const id =
          typeof req.body?.request === "string" ? req.body.request : "";
        const pending = this.store.getAuth<Grant>("pending", hash(id));
        const csrf = (req.headers.cookie ?? "")
          .split(";")
          .map((x) => x.trim())
          .find((x) => x.startsWith("bt_authorization="))
          ?.slice("bt_authorization=".length);
        if (
          !pending ||
          !csrf ||
          hash(csrf) !== pending.csrfHash ||
          (req.headers.origin && req.headers.origin !== this.base)
        ) {
          res
            .status(400)
            .send(
              "Authorization expired or invalid. Reconnect from your assistant.",
            );
          return;
        }
        if (
          typeof req.body.password !== "string" ||
          !(await checkPassword(req.body.password, this.ownerHash))
        ) {
          res
            .status(401)
            .send(
              "Incorrect owner password. Restart the connection to try again.",
            );
          return;
        }
        // Recheck after password hashing: a pending grant can be consumed only once.
        if (!this.store.getAuth("pending", hash(id))) {
          res.status(400).send("Authorization already used");
          return;
        }
        this.store.delAuth("pending", hash(id));
        const code = token();
        this.store.setAuth("code", hash(code), pending, Date.now() + 120000);
        const callback = new URL(pending.params.redirectUri);
        callback.searchParams.set("code", code);
        if (pending.params.state)
          callback.searchParams.set("state", pending.params.state);
        res.clearCookie("bt_authorization", { path: "/login" });
        res.redirect(callback.toString());
      },
    );
  }
  private grant(client: OAuthClientInformationFull, code: string) {
    const g = this.store.getAuth<Grant>("code", hash(code));
    if (!g || g.clientId !== client.client_id)
      throw new InvalidGrantError("Invalid or expired authorization code");
    return g;
  }
  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
  ) {
    return this.grant(client, code).params.codeChallenge;
  }
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _verifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const g = this.grant(client, code);
    this.checkResource(resource);
    if (redirectUri !== g.params.redirectUri)
      throw new InvalidGrantError("Redirect URI mismatch");
    this.store.delAuth("code", hash(code));
    return this.issue(client.client_id, randomUUID());
  }
  private issue(clientId: string, family: string): OAuthTokens {
    const access = token(),
      refresh = token(),
      expiresAt = Math.floor(Date.now() / 1000) + 3600;
    this.store.setAuth(
      "family",
      family,
      { clientId },
      Date.now() + 30 * 86400000,
    );
    const data = {
      clientId,
      scopes: ["toolkit:read"],
      resource: this.resource,
      expiresAt,
      family,
    };
    this.store.setAuth("access", hash(access), data, expiresAt * 1000);
    this.store.setAuth(
      "refresh",
      hash(refresh),
      data,
      Date.now() + 30 * 86400000,
    );
    return {
      access_token: access,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: refresh,
      scope: "toolkit:read",
    };
  }
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refresh: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    this.checkResource(resource);
    if (scopes?.some((s) => s !== "toolkit:read"))
      throw new InvalidScopeError("Invalid scope");
    const g = this.store.getAuth<StoredToken>("refresh", hash(refresh));
    if (
      !g ||
      g.clientId !== client.client_id ||
      !this.store.getAuth("family", g.family)
    )
      throw new InvalidGrantError("Invalid or expired refresh token");
    this.store.delAuth("refresh", hash(refresh));
    return this.issue(client.client_id, g.family);
  }
  async verifyAccessToken(access: string): Promise<AuthInfo> {
    const t = this.store.getAuth<StoredToken>("access", hash(access));
    if (
      !t ||
      t.resource !== this.resource ||
      !this.store.getAuth("family", t.family)
    )
      throw new InvalidTokenError("Invalid or expired token");
    return {
      token: access,
      clientId: t.clientId,
      scopes: t.scopes,
      expiresAt: t.expiresAt,
      resource: new URL(t.resource),
    };
  }
  async revokeToken(
    client: OAuthClientInformationFull,
    request: { token: string },
  ) {
    const id = hash(request.token);
    const t =
      this.store.getAuth<StoredToken>("access", id) ??
      this.store.getAuth<StoredToken>("refresh", id);
    if (t?.clientId === client.client_id) {
      this.store.delAuth("family", t.family);
      this.store.delAuth("access", id);
      this.store.delAuth("refresh", id);
    }
  }
}
