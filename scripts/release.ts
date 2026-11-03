import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

// 1. Validate version argument
const rawVersion = process.argv[2];
if (!rawVersion) {
  console.error('\x1b[31mError:\x1b[0m Please provide a version number (e.g., bun release 1.0.5)');
  process.exit(1);
}

const version = rawVersion.replace(/^v/, '').trim();
const semverRegex = /^\d+\.\d+\.\d+.*$/;
if (!semverRegex.test(version)) {
  console.error(`\x1b[31mError:\x1b[0m "${version}" is not a valid semver string (format: X.Y.Z)`);
  process.exit(1);
}

const tag = `v${version}`;
const rootDir = resolve(__dirname, '..');

// 2. Pre-flight Git Checks
try {
  // Ensure we are on the main branch
  const branch = execSync('git branch --show-current').toString().trim();
  if (branch !== 'main') {
    console.error(`\x1b[31mError:\x1b[0m Releases must be cut from "main" (currently on "${branch}").`);
    process.exit(1);
  }

  // Ensure working directory is clean
  const status = execSync('git status --porcelain').toString().trim();
  if (status) {
    console.error('\n\x1b[31mError: Working directory has uncommitted or unstaged changes:\x1b[0m');
    console.error(status);
    console.error('\n\x1b[33mCommit or stash changes before running a release.\x1b[0m\n');
    process.exit(1);
  }

  // Check if tag already exists locally or remotely
  try {
    execSync(`git rev-parse "${tag}"`, { stdio: 'ignore' });
    console.error(`\x1b[31mError:\x1b[0m Local tag "${tag}" already exists. Bump the version.`);
    process.exit(1);
  } catch {
    // Tag does not exist locally; continue
  }
} catch (err: any) {
  if (err.status !== undefined && err.status !== 0 && !err.message.includes('rev-parse')) {
    console.error('\x1b[31mGit pre-check failed:\x1b[0m', err.message);
    process.exit(1);
  }
}

// 3. Paths to target files
const pkgPath = resolve(rootDir, 'package.json');
const tauriPath = resolve(rootDir, 'src-tauri/tauri.conf.json');
const cargoPath = resolve(rootDir, 'src-tauri/Cargo.toml');

console.log(`\n\x1b[36m🚀 Preparing release ${tag}...\x1b[0m\n`);

// 4. Update package.json
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`  ✓ Synced package.json (${version})`);
}

// 5. Update src-tauri/tauri.conf.json
if (existsSync(tauriPath)) {
  const tauri = JSON.parse(readFileSync(tauriPath, 'utf8'));
  tauri.version = version;
  writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');
  console.log(`  ✓ Synced src-tauri/tauri.conf.json (${version})`);
}

// 6. Update src-tauri/Cargo.toml
if (existsSync(cargoPath)) {
  let cargoContent = readFileSync(cargoPath, 'utf8');
  cargoContent = cargoContent.replace(/^version = ".*?"/m, `version = "${version}"`);
  writeFileSync(cargoPath, cargoContent);
  console.log(`  ✓ Synced src-tauri/Cargo.toml (${version})`);
}

// 7. Git commit, tag, and push
try {
  console.log('\n\x1b[36m📦 Committing and pushing to GitHub...\x1b[0m\n');

  execSync(`git add "${pkgPath}" "${tauriPath}" "${cargoPath}"`, { stdio: 'inherit' });

  // Check if anything was staged before committing
  const stagedChanges = execSync('git diff --staged --name-only').toString().trim();
  if (stagedChanges.length > 0) {
    execSync(`git commit -m "chore(release): bump version to ${tag}"`, { stdio: 'inherit' });
    console.log(`  ✓ Created commit for ${tag}`);
  } else {
    console.log(`  ℹ Version files were already up-to-date in HEAD (no new commit needed).`);
  }

  // Push main branch if there are any unpushed commits
  execSync('git push origin main', { stdio: 'inherit' });

  // Create annotated tag and push
  execSync(`git tag -a "${tag}" -m "Release ${tag}"`, { stdio: 'inherit' });
  execSync(`git push origin "${tag}"`, { stdio: 'inherit' });

  console.log(`\n\x1b[32m✔ Successfully tagged and published ${tag}!\x1b[0m`);
  console.log('GitHub Actions is now compiling the release bundle.\n');
} catch (error) {
  console.error('\n\x1b[31mRelease process failed:\x1b[0m', error);
  process.exit(1);
}