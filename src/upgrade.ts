import { VERSION } from "./version";

interface Release {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
}

function getAssetName(): string {
  const os = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `wt-${os}-${arch}`;
}

function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((n) => Number.parseInt(n, 10));
  const [aMajor = 0, aMinor = 0, aPatch = 0] = parse(a);
  const [bMajor = 0, bMinor = 0, bPatch = 0] = parse(b);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

export async function upgrade(): Promise<void> {
  console.log(`Current version: ${VERSION}`);

  const res = await fetch(
    "https://api.github.com/repos/elitan/wt/releases/latest",
  );

  if (res.status === 404) {
    console.log("No releases found");
    return;
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch releases: ${res.statusText}`);
  }

  const release = (await res.json()) as Release;
  const latestVersion = release.tag_name.replace(/^v/, "");

  if (VERSION !== "dev" && compareVersions(VERSION, latestVersion) >= 0) {
    console.log("Already up to date");
    return;
  }

  const assetName = getAssetName();
  const asset = release.assets.find((a) => a.name === assetName);

  if (!asset) {
    throw new Error(`No binary found for ${assetName}`);
  }

  console.log(`Downloading ${release.tag_name}...`);

  const binaryRes = await fetch(asset.browser_download_url);
  if (!binaryRes.ok) {
    throw new Error(`Failed to download binary: ${binaryRes.statusText}`);
  }

  const binary = await binaryRes.arrayBuffer();
  const execPath = process.execPath;
  const tempPath = `${execPath}.tmp`;

  await Bun.write(tempPath, binary, { mode: 0o755 });

  const proc = Bun.spawn(["mv", tempPath, execPath]);
  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new Error("Failed to replace binary");
  }

  console.log(`Upgraded to ${release.tag_name}`);
}
