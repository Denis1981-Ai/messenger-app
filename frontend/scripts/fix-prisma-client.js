/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

const sourceDir = path.join(process.cwd(), "node_modules", ".prisma", "client");
const targetDir = path.join(process.cwd(), "node_modules", "@prisma", "client");

const files = [
  "client.d.ts",
  "default.d.ts",
  "edge.d.ts",
  "index.d.ts",
  "wasm.d.ts",
];

for (const fileName of files) {
  const sourcePath = path.join(sourceDir, fileName);
  const targetPath = path.join(targetDir, fileName);

  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath);
  }
}
