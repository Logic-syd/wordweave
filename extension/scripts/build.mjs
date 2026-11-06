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
const bundle = await build({
  absWorkingDir: path.resolve(root, ".."),
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
  metafile: true,
});
// Distribute licenses for the packages actually bundled, not the entire website.
const packageRoots = new Set();
for (const input of Object.keys(bundle.metafile.inputs)) {
  const marker = input.lastIndexOf("node_modules/");
  if (marker < 0) continue;
  const parts = input.slice(marker + "node_modules/".length).split("/");
  const name = parts[0].startsWith("@")
    ? parts.slice(0, 2).join("/")
    : parts[0];
  packageRoots.add(
    path.resolve(root, "..", input.slice(0, marker), "node_modules", name),
  );
}
const notices = [];
for (const directory of [...packageRoots].sort()) {
  const pkg = JSON.parse(
    await readFile(path.join(directory, "package.json"), "utf8"),
  );
  const licenseFiles = (await readdir(directory)).filter((file) =>
    /^(?:licen[cs]e|copying)(?:\.(?:md|txt))?$/i.test(file),
  );
  if (!licenseFiles.length)
    throw new Error(`Missing bundled license text: ${pkg.name}`);
  const texts = await Promise.all(
    licenseFiles
      .sort()
      .map((file) => readFile(path.join(directory, file), "utf8")),
  );
  notices.push(
    `${pkg.name} ${pkg.version}\nLicense: ${pkg.license ?? "See text below"}\n${texts.join("\n")}`,
  );
}
await writeFile(
  path.join(dist, "THIRD_PARTY_NOTICES.txt"),
  notices.join("\n\n========================================\n\n"),
);
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
