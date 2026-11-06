import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A separate publisher download; never included inside the installable extension. */
export async function makeChromeStoreKit(extensionArchive) {
  const manifest = JSON.parse(
    await readFile(path.join(root, "manifest.json"), "utf8"),
  );
  const store = path.join(root, "store/chrome");
  const provenance = JSON.parse(
    await readFile(path.join(store, "images/provenance.json"), "utf8"),
  );
  assert.equal(
    provenance.version,
    manifest.version,
    "Refresh store assets for the current extension version",
  );
  const files = {};
  const add = (name, contents) => {
    files[name] = [
      new Uint8Array(contents),
      { mtime: new Date("2026-01-01T00:00:00Z") },
    ];
  };
  for (const filename of ["START-HERE.txt", "listing.txt", "submission.md"])
    add(filename, await readFile(path.join(store, filename)));
  for (const [filename, [width, height]] of Object.entries(provenance.sizes)) {
    assert.equal(path.basename(filename), filename);
    const png = await readFile(path.join(store, "images", filename));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);
    assert.equal(png[25], 2, "Use opaque RGB PNGs for store images");
    add(filename, png);
  }
  add(
    "icon-128.png",
    await readFile(path.join(root, "static/icons/icon-128.png")),
  );
  add(
    "image-provenance.json",
    Buffer.from(JSON.stringify(provenance, null, 2) + "\n"),
  );
  add(`wordweave-chrome-${manifest.version}.zip`, extensionArchive);
  return zipSync(files, { level: 9 });
}
