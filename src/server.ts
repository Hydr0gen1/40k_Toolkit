import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { PersonalOAuth } from "./auth.js";
import { Store } from "./store.js";
import { createMcp } from "./tools.js";
import { installCalculator } from "./calculator-routes.js";

export type Config = {
  baseUrl: string;
  ownerPasswordHash: string;
  callbackOrigins: string[];
  trustProxy: boolean;
};
export function createApp(store: Store, config: Config) {
  const base = new URL(config.baseUrl);
  if (
    base.pathname !== "/" ||
    base.search ||
    base.hash ||
    base.username ||
    base.password
  )
    throw new Error(
      "PUBLIC_URL must be a bare HTTPS origin on its own subdomain",
    );
  if (
    base.protocol !== "https:" &&
    !(
      base.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(base.hostname)
    )
  )
    throw new Error("HTTPS required outside localhost");
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(config.ownerPasswordHash))
    throw new Error("Set OWNER_PASSWORD_HASH using the init command");
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy ? 1 : false);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "upgrade-insecure-requests": base.protocol === "http:" ? null : [],
          "worker-src": ["'self'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: false, limit: "4kb" }));
  app.use((req, res, next) => {
    if (req.path === "/healthz" || req.path === "/readyz") {
      next();
      return;
    }
    if (req.headers.host !== base.host) {
      res.status(400).json({ error: "Unexpected Host header" });
      return;
    }
    if (
      req.headers.origin &&
      req.headers.origin !== base.origin &&
      !config.callbackOrigins.includes(req.headers.origin)
    ) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
    next();
  });
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  installCalculator(app);
  app.get("/readyz", (_req, res) => {
    const s = store.active();
    res.status(s ? 200 : 503).json({
      ready: !!s,
      coverage: s?.coverage.status ?? "none",
      stale: !s || Date.now() - Date.parse(s.createdAt) > 48 * 3600000,
    });
  });
  app.get("/", (_req, res) =>
    res
      .type("text")
      .send(
        "Black Templars AI Toolkit. Connect your assistant to /mcp. Rules coverage is reported by get_data_status.",
      ),
  );
  const provider = new PersonalOAuth(
    store,
    base.origin,
    config.ownerPasswordHash,
    config.callbackOrigins,
  );
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: base,
      resourceServerUrl: new URL("/mcp", base),
      scopesSupported: ["toolkit:read"],
      resourceName: "Black Templars AI Toolkit",
    }),
  );
  provider.installLogin(app);
  app.use(
    "/mcp",
    requireBearerAuth({
      verifier: provider,
      requiredScopes: ["toolkit:read"],
      resourceMetadataUrl:
        base.origin + "/.well-known/oauth-protected-resource/mcp",
    }),
    rateLimit({
      windowMs: 60000,
      limit: 60,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );
  app.post("/mcp", async (req, res, next) => {
    const mcp = createMcp(store);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void mcp.close();
    });
    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      next(e);
    }
  });
  app.all("/mcp", (_req, res) => {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Stateless transport supports POST only" });
  });
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(
        "Request failed:",
        err instanceof Error ? err.message : "Unknown error",
      );
      if (!res.headersSent)
        res.status(500).json({
          error:
            "Request failed. Check server logs; no internal details are exposed.",
        });
    },
  );
  return { app, provider };
}
