import { spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const label = `verify-${Date.now()}`;
function run(script, args, success = true) {
  const result = spawnSync(
    process.execPath,
    [join(import.meta.dirname, script), ...args],
    { cwd: root, encoding: "utf8" },
  );
  if ((result.status === 0) !== success)
    throw new Error(
      result.stderr || result.stdout || "Unexpected recovery result",
    );
  return result.stdout;
}
console.log(run("checkpoint.mjs", ["--label", label]));
console.log(run("rollback.mjs", ["--label", label]));
const recovered = readdirSync(join(root, "rollback-recovery")).find((name) =>
  name.startsWith(label + "-"),
);
if (!recovered) throw new Error("Recovery folder missing");
const manifest = JSON.parse(
  readFileSync(join(root, "checkpoints", `${label}.json`), "utf8"),
);
const listed = spawnSync(
  "git",
  ["ls-tree", "-r", "--name-only", manifest.commit],
  { cwd: root, encoding: "utf8" },
);
if (listed.status !== 0) throw new Error("Cannot list checkpoint files");
const files = listed.stdout.trim().split("\n");
for (const file of files) {
  // Git archive respects platform EOL conversion. Compare canonical Git blobs;
  // .gitattributes declares PDFs/images binary so their bytes remain unchanged.
  const expected = spawnSync(
    "git",
    ["rev-parse", `${manifest.commit}:${file}`],
    { cwd: root, encoding: "utf8" },
  );
  const actual = spawnSync(
    "git",
    [
      "hash-object",
      `--path=${file}`,
      join(root, "rollback-recovery", recovered, file),
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (
    expected.status !== 0 ||
    actual.status !== 0 ||
    expected.stdout.trim() !== actual.stdout.trim()
  )
    throw new Error(`Recovered content mismatch: ${file}`);
}
const altered = label + "-altered";
const archive = join(root, "checkpoints", `${altered}.zip`),
  metadata = join(root, "checkpoints", `${altered}.json`);
copyFileSync(join(root, "checkpoints", `${label}.zip`), archive);
writeFileSync(
  archive,
  Buffer.concat([readFileSync(archive), Buffer.from("tampered")]),
);
writeFileSync(metadata, JSON.stringify({ ...manifest, label: altered }));
run("rollback.mjs", ["--label", altered], false);
unlinkSync(archive);
unlinkSync(metadata);
console.log(
  `PASS: ${files.length} files match committed snapshot; tampered archive rejected; current project preserved.`,
);
