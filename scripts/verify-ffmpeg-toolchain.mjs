import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(projectRoot, 'electron-app', 'tools', 'ffmpeg-manifest.json');

const fail = (message) => {
  console.error(`[verify:ffmpeg] ${message}`);
  process.exit(1);
};

if (!existsSync(manifestPath)) {
  fail(`Missing manifest at ${manifestPath}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const artifactPath = resolve(projectRoot, String(manifest.artifact ?? ''));

if (!existsSync(artifactPath)) {
  fail(`Missing ffmpeg binary at ${artifactPath}`);
}

const hash = createHash('sha256').update(readFileSync(artifactPath)).digest('hex').toUpperCase();
const expectedHash = String(manifest.sha256 ?? '').toUpperCase();
if (!expectedHash || hash !== expectedHash) {
  fail(`SHA256 mismatch for ${artifactPath}; expected ${expectedHash || 'n/a'}, got ${hash}`);
}

const versionOutput = execFileSync(artifactPath, ['-hide_banner', '-version'], {
  encoding: 'utf8',
  timeout: 5000,
  windowsHide: true,
});
const version = String(manifest.version ?? '');
if (version && !versionOutput.includes(version)) {
  fail(`Version output does not contain "${version}"`);
}

if (manifest.requiresSoxr === true && !versionOutput.includes('--enable-libsoxr')) {
  fail('FFmpeg build configuration does not include --enable-libsoxr');
}

const filtersOutput = execFileSync(artifactPath, ['-hide_banner', '-filters'], {
  encoding: 'utf8',
  timeout: 5000,
  windowsHide: true,
});
const requiredFilters = Array.isArray(manifest.requiredFilters) ? manifest.requiredFilters : [];
for (const filter of requiredFilters) {
  const pattern = new RegExp(`(^|\\n)\\s*\\.{2,3}\\s+${String(filter).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'u');
  if (!pattern.test(filtersOutput)) {
    fail(`Required FFmpeg filter is missing: ${filter}`);
  }
}

console.log(`[verify:ffmpeg] OK ${version || artifactPath} sha256=${hash}`);
