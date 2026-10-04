import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, "..");
const argument = process.argv.indexOf("--label");
const label =
  argument >= 0 ? process.argv[argument + 1] : `rescue-${Date.now()}`;
if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,60}$/.test(label ?? ""))
  throw new Error(
    "Use a simple checkpoint label: letters, numbers, dash, underscore",
  );
function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(result.stderr || "Git command failed");
  return result.stdout.trim();
}
if (git(["status", "--porcelain"]))
  throw new Error(
    "Commit source changes before creating a checkpoint. No files were changed.",
  );
const directory = join(root, "checkpoints");
mkdirSync(directory, { recursive: true });
const archive = join(directory, `${label}.zip`),
  manifest = join(directory, `${label}.json`);
if (existsSync(archive) || existsSync(manifest))
  throw new Error("Checkpoint label already exists; use a new label");
const refArgument = process.argv.indexOf("--ref");
const ref = refArgument >= 0 ? process.argv[refArgument + 1] : "HEAD";
if (!/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,120}$/.test(ref ?? ""))
  throw new Error("Invalid checkpoint ref");
const commit = git(["rev-parse", "--verify", `${ref}^{commit}`]);
git(["archive", "--format=zip", `--output=${archive}`, commit]);
const sha256 = createHash("sha256").update(readFileSync(archive)).digest("hex");
writeFileSync(
  manifest,
  JSON.stringify(
    { version: 1, label, commit, sha256, createdAt: new Date().toISOString() },
    null,
    2,
  ) + "\n",
);
console.log(`Checkpoint: ${archive}\nCommit: ${commit}\nSHA-256: ${sha256}`);
