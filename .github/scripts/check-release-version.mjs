import { readFile } from "node:fs/promises";

const tag = process.env.RELEASE_TAG;
if (!tag) throw new Error("RELEASE_TAG is required");
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(tag)) {
  throw new Error(`Release tags must be bare semantic versions such as 0.2.0 or 0.2.0-beta.1; received ${tag}`);
}

const desktopPackage = JSON.parse(await readFile("apps/desktop/package.json", "utf8"));
const tauriConfig = JSON.parse(await readFile("apps/desktop/src-tauri/tauri.conf.json", "utf8"));
const cargoToml = await readFile("apps/desktop/src-tauri/Cargo.toml", "utf8");
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

const versions = {
  "release tag": tag,
  "apps/desktop/package.json": desktopPackage.version,
  "tauri.conf.json": tauriConfig.version,
  "Cargo.toml": cargoVersion,
};
const unique = new Set(Object.values(versions));
if (unique.size !== 1) {
  throw new Error(`Release versions are not synchronized:\n${JSON.stringify(versions, null, 2)}`);
}

console.log(`Release version ${tag} is synchronized across all manifests.`);
