import { build } from "esbuild";
import { zipSync } from "fflate";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, "static"), dist, { recursive: true });
await cp(path.join(root, "manifest.json"), path.join(dist, "manifest.json"));
await build({
  entryPoints: ["background", "popup", "options", "content", "library"].map(
    (file) => path.join(root, "src", `${file}.ts`),
  ),
  outdir: dist,
  bundle: true,
  format: "iife",
  target: "chrome116",
  platform: "browser",
  // MV3's background has no DOM. Markdown dependencies expose a worker-safe
  // entry instead of their browser entry that calls document.createElement.
  conditions: ["worker"],
  sourcemap: false,
  minify: true,
  legalComments: "none",
});
const files = {};
async function collect(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix + entry.name;
    if (entry.isDirectory())
      await collect(path.join(directory, entry.name), `${name}/`);
    else
      files[name] = [
        new Uint8Array(await readFile(path.join(directory, entry.name))),
        { mtime: new Date("2026-01-01T00:00:00Z") },
      ];
  }
}
await collect(dist);
const downloads = path.resolve(root, "../public/downloads");
await mkdir(downloads, { recursive: true });
await writeFile(
  path.join(downloads, "wordweave-extension.zip"),
  zipSync(files, { level: 9 }),
);
console.log(
  "语境插件已构建：extension/dist；下载包：public/downloads/wordweave-extension.zip",
);
