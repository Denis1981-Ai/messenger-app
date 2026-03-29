/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

const rootDir = process.cwd();
const tauriConfigPath = path.join(rootDir, "src-tauri", "tauri.conf.json");
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));
const version = tauriConfig.version;
const baseUrl = (process.env.DESKTOP_UPDATE_BASE_URL || "https://chat.svarka-weld.ru").replace(/\/+$/, "");
const bundleDir = path.join(rootDir, "src-tauri", "target", "release", "bundle", "nsis");
const publicDir = path.join(rootDir, "public", "desktop-updates", "windows-x86_64");

const installerName = `Svarka Weld Messenger_${version}_x64-setup.exe`;
const installerPath = path.join(bundleDir, installerName);
const signaturePath = `${installerPath}.sig`;

if (!fs.existsSync(installerPath)) {
  throw new Error(`Installer not found: ${installerPath}`);
}

if (!fs.existsSync(signaturePath)) {
  throw new Error(`Updater signature not found: ${signaturePath}`);
}

fs.mkdirSync(publicDir, { recursive: true });

const publishedInstallerPath = path.join(publicDir, installerName);
const publishedSignaturePath = path.join(publicDir, `${installerName}.sig`);
const latestJsonPath = path.join(publicDir, "latest.json");
const signature = fs.readFileSync(signaturePath, "utf8").trim();
const installerUrl = `${baseUrl}/desktop-updates/windows-x86_64/${encodeURIComponent(installerName)}`;

fs.copyFileSync(installerPath, publishedInstallerPath);
fs.copyFileSync(signaturePath, publishedSignaturePath);

const manifest = {
  version,
  notes: `Desktop update ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: installerUrl,
    },
  },
};

fs.writeFileSync(latestJsonPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      version,
      installer: publishedInstallerPath,
      signature: publishedSignaturePath,
      manifest: latestJsonPath,
      installerUrl,
    },
    null,
    2
  )
);
