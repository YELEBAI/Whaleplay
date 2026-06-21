import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { appendFile, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";

const rawPaths = JSON.parse(process.env.ARTIFACT_PATHS || "[]");
const checksumFile = process.env.CHECKSUM_FILE;
const githubOutput = process.env.GITHUB_OUTPUT;

if (!Array.isArray(rawPaths) || !checksumFile || !githubOutput) {
  throw new Error("ARTIFACT_PATHS, CHECKSUM_FILE and GITHUB_OUTPUT are required");
}

const candidates = new Set();
for (const value of rawPaths) {
  if (typeof value !== "string" || value.length === 0) continue;
  candidates.add(value);
  candidates.add(`${value}.sig`);
  candidates.add(`${value}.tar.gz`);
  candidates.add(`${value}.tar.gz.sig`);
}

const files = [];
for (const path of candidates) {
  try {
    if ((await stat(path)).isFile()) files.push(path);
  } catch {
    // Tauri reports cross-platform candidates; only generated files are relevant.
  }
}

files.sort((a, b) => a.localeCompare(b));
if (files.length === 0) throw new Error("Tauri produced no file artifacts to checksum");

const lines = [];
for (const path of files) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  lines.push(`${hash.digest("hex")}  ${basename(path)}`);
}

await mkdir(dirname(checksumFile), { recursive: true });
await writeFile(checksumFile, `${lines.join("\n")}\n`, "utf8");

const attestedPaths = [...files, checksumFile];
await appendFile(githubOutput, `subject_paths<<EOF\n${attestedPaths.join("\n")}\nEOF\n`, "utf8");
await appendFile(githubOutput, `checksum_file=${checksumFile}\n`, "utf8");

console.log(`Prepared checksums for ${files.length} release artifact(s).`);
