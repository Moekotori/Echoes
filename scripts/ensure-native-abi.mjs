import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), '..');
const target = process.argv[2] ?? 'electron';
const packageJsonPath = join(projectRoot, 'package.json');
const betterSqlitePackageJsonPath = join(projectRoot, 'node_modules', 'better-sqlite3', 'package.json');
const nativeBinaryPath = join(projectRoot, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
const markerPath = join(projectRoot, 'node_modules', '.echo-native-abi.json');

const executable = (name) => (process.platform === 'win32' ? `${name}.cmd` : name);
const quoteShellArg = (value) => `"${String(value).replace(/"/g, '\\"')}"`;

const run = (command, args, options = {}) => {
  const useCmdShell = process.platform === 'win32' && command.endsWith('.cmd');
  const result = spawnSync(useCmdShell ? [command, ...args].map(quoteShellArg).join(' ') : command, useCmdShell ? [] : args, {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: useCmdShell,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}${output ? `\n${output}` : ''}`);
  }

  return typeof result.stdout === 'string' ? result.stdout.trim() : '';
};

const findNpmCli = () => {
  const npmCliPath = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return existsSync(npmCliPath) ? npmCliPath : null;
};

const readJson = (filePath) => JSON.parse(readFileSync(filePath, 'utf8'));

const getElectronAbi = async (electronVersion) => {
  try {
    const { getAbi } = await import('node-abi');
    return getAbi(electronVersion, 'electron');
  } catch {
    return run(join(projectRoot, 'node_modules', '.bin', executable('electron')), ['--abi']);
  }
};

const getTargetInfo = async () => {
  if (target === 'electron') {
    const electronPackageJson = readJson(join(projectRoot, 'node_modules', 'electron', 'package.json'));

    return {
      runtime: 'electron',
      abi: await getElectronAbi(electronPackageJson.version),
      runtimeVersion: electronPackageJson.version,
    };
  }

  if (target === 'node') {
    return {
      runtime: 'node',
      abi: process.versions.modules,
      runtimeVersion: process.version,
    };
  }

  throw new Error(`Unknown native ABI target "${target}". Expected "electron" or "node".`);
};

const getNativeStats = () => {
  if (!existsSync(nativeBinaryPath)) {
    return null;
  }

  const stats = statSync(nativeBinaryPath);

  return {
    size: stats.size,
    mtimeMs: stats.mtimeMs,
  };
};

const readMarker = () => {
  if (!existsSync(markerPath)) {
    return null;
  }

  try {
    return readJson(markerPath);
  } catch {
    return null;
  }
};

const writeMarker = (info) => {
  const nativeStats = getNativeStats();

  if (!nativeStats) {
    throw new Error(`Native binary was not found after rebuild: ${nativeBinaryPath}`);
  }

  mkdirSync(dirname(markerPath), { recursive: true });
  writeFileSync(
    markerPath,
    `${JSON.stringify(
      {
        ...info,
        betterSqlite3Version: readJson(betterSqlitePackageJsonPath).version,
        nativeBinary: nativeStats,
      },
      null,
      2,
    )}\n`,
  );
};

const isCurrent = (marker, info) => {
  const nativeStats = getNativeStats();

  return Boolean(
    marker &&
      nativeStats &&
      marker.runtime === info.runtime &&
      marker.abi === info.abi &&
      marker.betterSqlite3Version === readJson(betterSqlitePackageJsonPath).version &&
      marker.nativeBinary?.size === nativeStats.size &&
      marker.nativeBinary?.mtimeMs === nativeStats.mtimeMs,
  );
};

const rebuild = (info) => {
  if (info.runtime === 'electron') {
    run(join(projectRoot, 'node_modules', '.bin', executable('electron-rebuild')), ['-f', '-w', 'better-sqlite3'], {
      stdio: 'inherit',
      encoding: undefined,
    });
    return;
  }

  const npmCliPath = findNpmCli();

  if (npmCliPath) {
    run(process.execPath, [npmCliPath, 'rebuild', 'better-sqlite3'], {
      stdio: 'inherit',
      encoding: undefined,
    });
    return;
  }

  run(executable('npm'), ['rebuild', 'better-sqlite3'], {
    stdio: 'inherit',
    encoding: undefined,
  });
};

try {
  const info = await getTargetInfo();

  if (isCurrent(readMarker(), info)) {
    console.log(`[native-abi] better-sqlite3 already matches ${info.runtime} ABI ${info.abi}; skipping rebuild.`);
    process.exit(0);
  }

  console.log(`[native-abi] Rebuilding better-sqlite3 for ${info.runtime} ABI ${info.abi}...`);
  rebuild(info);
  writeMarker(info);
  console.log(`[native-abi] better-sqlite3 now matches ${info.runtime} ABI ${info.abi}.`);
} catch (error) {
  console.error(`[native-abi] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
