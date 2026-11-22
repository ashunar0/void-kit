/**
 * dist を作る。tsc の rewriteRelativeImportExtensions は .js の import を書き換えるが、.d.ts の import は
 * `./endpoint.ts` のまま残す。そのままだと、skipLibCheck を切ったアプリで型検査が落ちるので、ここで .js に直す
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

fs.rmSync("dist", { recursive: true, force: true });
execFileSync("tsc", ["-p", "tsconfig.build.json"], { stdio: "inherit" });
for (const file of fs.readdirSync("dist").filter((f) => f.endsWith(".d.ts"))) {
  const full = path.join("dist", file);
  fs.writeFileSync(full, fs.readFileSync(full, "utf8").replace(/(from "\.\.?\/[^"]+)\.ts"/g, '$1.js"'));
}
