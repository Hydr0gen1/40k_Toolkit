import { build } from "esbuild";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
await mkdir("dist/public/calculator", { recursive: true });
for (const name of ["index.html", "style.css"])
  await copyFile("src/calculator/" + name, "dist/public/calculator/" + name);
// Bundle the already compiled modules. Explicit resolution also avoids native
// directory enumeration outside the project in restricted Windows environments.
const result = await build({
  entryPoints: {
    app: "dist/src/calculator/app.js",
    worker: "dist/src/calculator/worker.js",
  },
  bundle: true,
  outdir: "dist/public/calculator",
  platform: "browser",
  format: "esm",
  target: "es2022",
  minify: true,
  write: false,
  tsconfigRaw: {},
  plugins: [
    {
      name: "project-files",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) => ({
          path:
            args.kind === "entry-point"
              ? resolve(args.path)
              : args.path.startsWith(".")
                ? resolve(dirname(args.importer), args.path)
                : createRequire(args.importer).resolve(args.path),
          namespace: "project-files",
        }));
        builder.onLoad(
          { filter: /.*/, namespace: "project-files" },
          async (args) => ({
            contents: await readFile(args.path, "utf8"),
            loader: "js",
          }),
        );
      },
    },
  ],
});
for (const file of result.outputFiles)
  await writeFile(file.path, file.contents);
