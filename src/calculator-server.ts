import express from "express";
import helmet from "helmet";
import { installCalculator } from "./calculator-routes.js";

const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "upgrade-insecure-requests": null,
        "worker-src": ["'self'"],
      },
    },
  }),
);
installCalculator(app);
app.get("/", (_req, res) => res.redirect("/calculator/"));
const port = Number(process.env.CALCULATOR_PORT ?? 8790);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid CALCULATOR_PORT");
const host = process.env.CALCULATOR_HOST ?? "127.0.0.1";
app.listen(port, host, () =>
  console.log(
    `Mathhammer calculator: http://${host === "0.0.0.0" ? "localhost" : host}:${port}/calculator/`,
  ),
);
