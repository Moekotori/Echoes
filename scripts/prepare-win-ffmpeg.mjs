import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const toolsDir = join(projectRoot, 'electron-app', 'tools');
const manifestPath = join(toolsDir, 'ffmpeg-manifest.json');
const tempDir = join(projectRoot, '.codex-temp', 'ffmpeg-win');

const fail = (message) => {
  console.error(`[prepare:win-ffmpeg] ${message}`);
  process.exit(1);
};

const runPowerShell = (command) => execFileSync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
  { encoding: 'utf8', windowsHide: true },
);

if (process.platform !== 'win32') {
  fail(`This script prepares Windows ffmpeg and must run on Windows. Current platform is ${process.platform}/${process.arch}.`);
}

if (!existsSync(manifestPath)) {
  fail(`Missing manifest at ${manifestPath}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const sourceUrl = String(manifest.sourceUrl ?? '');
const artifactPath = resolve(projectRoot, String(manifest.artifact ?? ''));
const expectedHash = String(manifest.sha256 ?? '').toUpperCase();

if (!sourceUrl) {
  fail('Manifest sourceUrl is not configured.');
}
if (!/^[A-F0-9]{64}$/u.test(expectedHash)) {
  fail('Manifest SHA256 is not configured.');
}

mkdirSync(toolsDir, { recursive: true });
mkdirSync(tempDir, { recursive: true });

if (existsSync(artifactPath)) {
  const stats = statSync(artifactPath);
  if (stats.isFile()) {
    const existingHash = createHash('sha256').update(readFileSync(artifactPath)).digest('hex').toUpperCase();
    if (existingHash === expectedHash) {
      console.log(`[prepare:win-ffmpeg] Existing ${artifactPath} already matches manifest.`);
      process.exit(0);
    }
  }
}

const zipPath = join(tempDir, 'ffmpeg.zip');
const extractDir = join(tempDir, 'extract');
rmSync(extractDir, { recursive: true, force: true });

runPowerShell(`Invoke-WebRequest -Uri ${JSON.stringify(sourceUrl)} -OutFile ${JSON.stringify(zipPath)} -UseBasicParsing`);
runPowerShell(`Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(extractDir)} -Force`);

const escapedExtractDir = extractDir.replace(/'/g, "''");
const ffmpegSource = runPowerShell(
  `$file = Get-ChildItem -LiteralPath '${escapedExtractDir}' -Recurse -Filter ffmpeg.exe | Select-Object -First 1; if (-not $file) { exit 2 }; $file.FullName`,
).trim();

runPowerShell(`Copy-Item -LiteralPath ${JSON.stringify(ffmpegSource)} -Destination ${JSON.stringify(artifactPath)} -Force`);

const hash = createHash('sha256').update(readFileSync(artifactPath)).digest('hex').toUpperCase();
if (hash !== expectedHash) {
  fail(`SHA256 mismatch for ${artifactPath}; expected ${expectedHash}, got ${hash}`);
}

console.log(`[prepare:win-ffmpeg] Prepared ${artifactPath}`);
