import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = root + "public/read-along/";
await mkdir(output, { recursive: true });
const html = (await readFile(root + "reading/web/index.html", "utf8"))
  .replace('href="/readalong.css"', 'href="/read-along/readalong.css"')
  .replace('src="/readalong.js"', 'src="/read-along/readalong.js"');
await writeFile(output + "index.html", html);
await copyFile(root + "reading/web/readalong.css", output + "readalong.css");
await build({
  absWorkingDir: root,
  entryPoints: ["reading/web/readalong.js"],
  outfile: output + "readalong.js",
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  logLevel: "warning",
});
console.log("Read Along: original reading interface built.");
