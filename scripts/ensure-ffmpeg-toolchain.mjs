import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(projectRoot, 'electron-app', 'tools', 'ffmpeg-manifest.json');
const cacheDirectory = join(projectRoot, '.cache', 'ffmpeg');

const log = (message) => console.log(`[ensure:ffmpeg] ${message}`);
const fail = (message) => {
  console.error(`[ensure:ffmpeg] ${message}`);
  process.exit(1);
};

const sha256File = (filePath) => createHash('sha256').update(readFileSync(filePath)).digest('hex').toUpperCase();

const shellQuote = (value) => `'${String(value).replace(/'/gu, "''")}'`;

const expandArchive = (archivePath, outputDirectory) => {
  rmSync(outputDirectory, { recursive: true, force: true });
  mkdirSync(outputDirectory, { recursive: true });

  if (process.platform === 'win32') {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath ${shellQuote(archivePath)} -DestinationPath ${shellQuote(outputDirectory)} -Force`,
      ],
      { stdio: 'inherit', windowsHide: true },
    );
    return;
  }

  execFileSync('tar', ['-xf', archivePath, '-C', outputDirectory], { stdio: 'inherit' });
};

const findExtractedFfmpeg = (directory) => {
  const candidates = [
    join(directory, 'ffmpeg.exe'),
    join(directory, 'ffmpeg'),
  ];

  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        stack.push(path);
      } else if (/^ffmpeg(?:\.exe)?$/iu.test(entry)) {
        candidates.push(path);
      }
    }
  }

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
};

const downloadFile = async (url, outputPath) => {
  mkdirSync(dirname(outputPath), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    fail(`Failed to download ${url}: HTTP ${response.status}`);
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(outputPath));
};

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const artifactPath = resolve(projectRoot, String(manifest.artifact ?? ''));
const expectedHash = String(manifest.sha256 ?? '').toUpperCase();

if (!expectedHash) {
  fail(`Manifest is missing sha256: ${manifestPath}`);
}

if (existsSync(artifactPath)) {
  const hash = sha256File(artifactPath);
  if (hash === expectedHash) {
    log(`OK existing ${artifactPath} sha256=${hash}`);
    process.exit(0);
  }

  log(`Existing binary hash mismatch; replacing ${artifactPath}`);
  rmSync(artifactPath, { force: true });
}

const sourceUrl = String(manifest.sourceUrl ?? '');
if (!/^https:\/\//iu.test(sourceUrl)) {
  fail(`Manifest is missing a HTTPS sourceUrl: ${manifestPath}`);
}

const archivePath = join(cacheDirectory, `${String(manifest.version ?? 'ffmpeg')}.zip`);
const extractDirectory = join(cacheDirectory, 'extract');

if (!existsSync(archivePath)) {
  log(`Downloading ${sourceUrl}`);
  await downloadFile(sourceUrl, archivePath);
} else {
  log(`Using cached archive ${archivePath}`);
}

log(`Extracting ${archivePath}`);
expandArchive(archivePath, extractDirectory);

const extractedFfmpeg = await findExtractedFfmpeg(extractDirectory);
if (!extractedFfmpeg) {
  fail(`Downloaded archive did not contain ffmpeg executable: ${archivePath}`);
}

mkdirSync(dirname(artifactPath), { recursive: true });
rmSync(artifactPath, { force: true });
copyFileSync(extractedFfmpeg, artifactPath);
if (process.platform !== 'win32') {
  chmodSync(artifactPath, 0o755);
}

const hash = sha256File(artifactPath);
if (hash !== expectedHash) {
  rmSync(artifactPath, { force: true });
  fail(`SHA256 mismatch for ${artifactPath}; expected ${expectedHash}, got ${hash}`);
}

log(`Installed ${artifactPath} sha256=${hash}`);
