import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

// 1. Validate argument
const rawVersion = process.argv[2];
if (!rawVersion) {
  console.error('\x1b[31mError:\x1b[0m Please provide a version number (e.g., bun run release 1.0.4)');
  process.exit(1);
}

// Strip leading 'v' if present (e.g., "v1.0.4" -> "1.0.4")
const version = rawVersion.replace(/^v/, '').trim();
const semverRegex = /^\d+\.\d+\.\d+.*$/;
if (!semverRegex.test(version)) {
  console.error(`\x1b[31mError:\x1b[0m "${version}" is not a valid semver string (expected format: X.Y.Z)`);
  process.exit(1);
}

const tag = `v${version}`;
const rootDir = resolve(__dirname, '..');

// 2. Paths to configuration files
const pkgPath = resolve(rootDir, 'package.json');
const tauriPath = resolve(rootDir, 'src-tauri/tauri.conf.json');
const cargoPath = resolve(rootDir, 'src-tauri/Cargo.toml');

console.log(`\n\x1b[36m🚀 Preparing release ${tag}...\x1b[0m\n`);

// 3. Update package.json
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`  ✓ Updated package.json to ${version}`);
}

// 4. Update src-tauri/tauri.conf.json
if (existsSync(tauriPath)) {
  const tauri = JSON.parse(readFileSync(tauriPath, 'utf8'));
  tauri.version = version;
  writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');
  console.log(`  ✓ Updated src-tauri/tauri.conf.json to ${version}`);
}

// 5. Update src-tauri/Cargo.toml (keeps Rust workspace in sync)
if (existsSync(cargoPath)) {
  let cargoContent = readFileSync(cargoPath, 'utf8');
  cargoContent = cargoContent.replace(/^version = ".*?"/m, `version = "${version}"`);
  writeFileSync(cargoPath, cargoContent);
  console.log(`  ✓ Updated src-tauri/Cargo.toml to ${version}`);
}

// 6. Git commit, tag, and push
try {
  console.log('\n\x1b[36m📦 Committing and pushing to GitHub...\x1b[0m\n');
  
  execSync(`git add "${pkgPath}" "${tauriPath}" "${cargoPath}"`, { stdio: 'inherit' });
  execSync(`git commit -m "chore(release): bump version to ${tag}"`, { stdio: 'inherit' });
  execSync(`git tag -a "${tag}" -m "Release ${tag}"`, { stdio: 'inherit' });
  execSync('git push origin main', { stdio: 'inherit' });
  execSync(`git push origin "${tag}"`, { stdio: 'inherit' });

  console.log(`\n\x1b[32m✔ Successfully released and pushed ${tag}!\x1b[0m`);
  console.log('GitHub Actions is now compiling your DMG bundle.\n');
} catch (error) {
  console.error('\n\x1b[31mGit command failed:\x1b[0m', error);
  process.exit(1);
}
