/** Creates a review candidate locally. Never uploads or submits to any store. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archive = await readFile(
  path.resolve(root, "../public/downloads/wordweave-extension.zip"),
);
const files = unzipSync(archive);
const expected = new Set([
  "manifest.json",
  "background.js",
  "content.js",
  "popup.js",
  "options.js",
  "library.js",
  "popup.html",
  "options.html",
  "library.html",
  "privacy.html",
  "ui.css",
  "THIRD_PARTY_NOTICES.txt",
  "icons/icon.svg",
  ...[16, 32, 48, 128].map((size) => `icons/icon-${size}.png`),
]);
assert.deepEqual(
  Object.keys(files).sort(),
  [...expected].sort(),
  "Unexpected or missing packaged files",
);
assert.ok(
  archive.byteLength < 2 * 1024 * 1024,
  "Unexpectedly large extension archive",
);
const decode = (name) =>
  new TextDecoder("utf-8", { fatal: true }).decode(files[name]);
const manifest = JSON.parse(decode("manifest.json"));
assert.equal(manifest.manifest_version, 3);
assert.match(manifest.version, /^\d+\.\d+\.\d+(?:\.\d+)?$/);
assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage"]);
assert.deepEqual(manifest.host_permissions, [
  "https://translate.googleapis.com/*",
]);
assert.deepEqual(manifest.optional_host_permissions, [
  "https://*/*",
  "http://localhost/*",
  "http://127.0.0.1/*",
]);
assert.equal(manifest.background.service_worker, "background.js");
assert.equal(manifest.background.type, "module");
assert.equal(
  manifest.content_security_policy.extension_pages,
  "script-src 'self'; object-src 'none'; base-uri 'none'",
);
assert.equal(manifest.externally_connectable, undefined);
assert.equal(manifest.update_url, undefined);
assert.equal(manifest.key, undefined);
for (const name of Object.keys(files)) {
  if (!/\.(?:json|js|html|txt|css|svg)$/.test(name)) continue;
  const text = decode(name);
  assert.ok(
    !/sk-[a-zA-Z0-9_-]{24,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(
      text,
    ),
    `Potential credential in ${name}`,
  );
  if (name.endsWith(".html")) {
    assert.ok(
      !/<script\b[^>]*src=["']https?:/i.test(text),
      `Remote script in ${name}`,
    );
    assert.ok(
      !/\bon[a-z]+\s*=|javascript:/i.test(text),
      `Inline event/script in ${name}`,
    );
    for (const [, script] of text.matchAll(
      /<script\b[^>]*src=["']([^"']+)["']/gi,
    ))
      assert.ok(expected.has(script), `Unpackaged script: ${script}`);
  }
}
for (const size of [16, 32, 48, 128]) {
  const png = Buffer.from(files[`icons/icon-${size}.png`]);
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
}
assert.ok(
  decode("privacy.html").includes(`插件 ${manifest.version}`),
  "Privacy version does not match manifest",
);
assert.ok(decode("THIRD_PARTY_NOTICES.txt").includes("License:"));
const sha256 = createHash("sha256").update(archive).digest("hex");
const directory = path.join(root, "release", `v${manifest.version}`);
await mkdir(directory, { recursive: true });
const filename = `wordweave-chrome-${manifest.version}.zip`;
await writeFile(path.join(directory, filename), archive);
const storeKit = await readFile(
  path.resolve(root, "../public/downloads/wordweave-chrome-store-kit.zip"),
);
assert.deepEqual(
  Buffer.from(unzipSync(storeKit)[filename]),
  archive,
  "Store kit must include this exact candidate",
);
await writeFile(
  path.join(directory, "wordweave-chrome-store-kit.zip"),
  storeKit,
);
await writeFile(
  path.join(directory, "SHA256SUMS.txt"),
  `${sha256}  ${filename}\n`,
);
await writeFile(
  path.join(directory, "checks.json"),
  JSON.stringify(
    {
      version: manifest.version,
      packageChecks: "passed",
      sha256,
      bytes: archive.byteLength,
      files: Object.keys(files).sort(),
      submissionStatus: "not-submitted",
      outstanding: [
        "Confirm the free translation provider's terms, availability and rate limits.",
        "Test native Chrome MV3 install, permissions, worker suspension and upgrades.",
        "Settings UI screenshot and promo image are prepared; verify the public privacy URL and complete developer registration.",
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `候选包检查通过：${path.relative(path.resolve(root, ".."), path.join(directory, filename))}`,
);
console.log(`SHA-256: ${sha256}`);
console.log(
  "安装包、文案、图标与商店图片已打包；尚未提交商店，真实翻译服务和 Chrome 原生安装待实机确认。",
);
