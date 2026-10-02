import express, { type Express } from "express";
import { fileURLToPath } from "node:url";

export function installCalculator(app: Express) {
  // Static, local computation only: no public endpoint for invoking backend tools.
  app.use(
    "/calculator",
    express.static(
      fileURLToPath(new URL("../public/calculator/", import.meta.url)),
      {
        index: "index.html",
        maxAge: 0,
        setHeaders(res) {
          res.setHeader("Cache-Control", "no-cache");
        },
      },
    ),
  );
}
