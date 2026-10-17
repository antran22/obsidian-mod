import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const BUMP = process.argv[2] ?? "patch";
if (!["patch", "minor", "major"].includes(BUMP)) {
  console.error(`Usage: node ${path.basename(fileURLToPath(import.meta.url))} [patch|minor|major]`);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, "\t") + "\n");
}

function bumpVersion(version, bump) {
  const [major, minor, patch] = version.split(".").map(Number);
  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
}

function runGit(args, options) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", ...options });
}

function runGitInteractive(args) {
  runGit(args, { stdio: "inherit" });
}

const status = runGit(["status", "--porcelain"]);
if (status) {
  console.error("Working tree is dirty. Commit or stash changes before bumping.");
  console.error(status);
  process.exit(1);
}

const packageJson = readJson("package.json");
const manifest = readJson("manifest.json");
const currentVersion = packageJson.version;
const nextVersion = bumpVersion(currentVersion, BUMP);

console.log(`Bumping ${BUMP}: ${currentVersion} -> ${nextVersion}`);

packageJson.version = nextVersion;
writeJson("package.json", packageJson);

const packageLock = readJson("package-lock.json");
packageLock.version = nextVersion;
packageLock.packages[""].version = nextVersion;
writeJson("package-lock.json", packageLock);

manifest.version = nextVersion;
writeJson("manifest.json", manifest);

const versions = readJson("versions.json");
versions[nextVersion] = manifest.minAppVersion;
writeJson("versions.json", versions);

runGitInteractive(["add", "package.json", "package-lock.json", "manifest.json", "versions.json"]);
runGitInteractive(["commit", "-m", `Bump version to ${nextVersion}`]);
runGitInteractive(["tag", "-a", `v${nextVersion}`, "-m", `v${nextVersion}`]);

console.log(`\nCreated tag v${nextVersion}.`);
console.log("Run: git push && git push --tags");
