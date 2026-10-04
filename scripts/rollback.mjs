import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, "..");
const argument = process.argv.indexOf("--label");
const label = argument >= 0 ? process.argv[argument + 1] : "";
if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,60}$/.test(label))
  throw new Error("Pass --label CHECKPOINT_LABEL");
const archive = join(root, "checkpoints", `${label}.zip`);
const manifest = JSON.parse(
  readFileSync(join(root, "checkpoints", `${label}.json`), "utf8"),
);
if (manifest.version !== 1 || manifest.label !== label)
  throw new Error("Invalid checkpoint manifest");
const actual = createHash("sha256").update(readFileSync(archive)).digest("hex");
if (actual !== manifest.sha256)
  throw new Error("Checkpoint checksum mismatch. Recovery stopped.");
const result = spawnSync("tar", ["-tf", archive], { encoding: "utf8" });
if (result.status !== 0)
  throw new Error(result.stderr || "Cannot inspect checkpoint archive");
for (const item of result.stdout.split(/\r?\n/).filter(Boolean)) {
  if (
    item.startsWith("/") ||
    /^[a-z]:/i.test(item) ||
    item.split(/[\\/]/).includes("..") ||
    item.startsWith(".git/")
  )
    throw new Error("Unsafe path in checkpoint archive");
}
const recoveryRoot = join(root, "rollback-recovery");
const destination = resolve(recoveryRoot, `${label}-${Date.now()}`);
if (!destination.startsWith(recoveryRoot + sep) || existsSync(destination))
  throw new Error(
    "Recovery destination must be a new folder inside rollback-recovery",
  );
mkdirSync(destination, { recursive: true });
const extracted = spawnSync("tar", ["-xf", archive, "-C", destination], {
  encoding: "utf8",
});
if (extracted.status !== 0)
  throw new Error(extracted.stderr || "Archive extraction failed");
console.log(
  `Recovered commit ${manifest.commit} into:\n${destination}\nCurrent project was preserved. Run npm ci and npm run build in the recovered project directory to start it.`,
);
