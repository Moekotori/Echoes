import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), '..');
const require = createRequire(import.meta.url);

const fail = (message, details = []) => {
  console.error(`[build:airplay-raop] ${message}`);
  for (const detail of details) {
    console.error(`[build:airplay-raop] ${detail}`);
  }
  process.exitCode = 1;
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
};

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const findVisualStudio = () => {
  const vswhere = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe';
  if (!existsSync(vswhere)) {
    return null;
  }

  const result = spawnSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.Component.MSBuild', '-property', 'installationPath'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  const installationPath = result.stdout.trim();
  if (!installationPath) {
    return null;
  }

  const msbuild = join(installationPath, 'MSBuild', 'Current', 'Bin', 'MSBuild.exe');
  const vcToolsDir = join(installationPath, 'VC', 'Tools', 'MSVC');
  if (!existsSync(msbuild) || !existsSync(vcToolsDir)) {
    return null;
  }

  const tools = spawnSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `$ErrorActionPreference='Stop'; Get-ChildItem -LiteralPath '${vcToolsDir.replaceAll("'", "''")}' -Directory | Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName`,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  const latestVcTools = tools.status === 0 ? tools.stdout.trim() : '';
  const vcBin = latestVcTools ? join(latestVcTools, 'bin', 'Hostx64', 'x64') : null;
  return { installationPath, msbuild, vcToolsDir, vcBin: vcBin && existsSync(join(vcBin, 'cl.exe')) ? vcBin : null };
};

const opensslCandidates = [
  process.env.OPENSSL_ROOT_DIR,
  process.env.OPENSSL_DIR,
  'C:\\Program Files\\OpenSSL-Win64',
  'C:\\Program Files (x86)\\OpenSSL-Win64',
  'C:\\vcpkg\\installed\\x64-windows',
].filter(Boolean);

const findOpenSsl = () => {
  for (const root of opensslCandidates) {
    const include = join(root, 'include', 'openssl', 'ssl.h');
    const lib = join(root, 'lib');
    if (existsSync(include) && existsSync(lib)) {
      return root;
    }
  }

  return null;
};

const findGitBash = () => {
  const candidates = [
    'F:\\Git\\bin',
    'F:\\Git\\usr\\bin',
    'C:\\Program Files\\Git\\bin',
    'C:\\Program Files\\Git\\usr\\bin',
  ];
  return candidates.find((candidate) => existsSync(join(candidate, 'bash.exe'))) ?? null;
};

const findPython = () => {
  const candidates = [
    process.env.PYTHON,
    'C:\\Users\\Moe\\AppData\\Local\\Programs\\Python\\Python313\\python.exe',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const result = spawnSync('where.exe', ['python'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  return result.status === 0
    ? result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null
    : null;
};

const createPython3Shim = (pythonPath) => {
  const shimDir = join(projectRoot, '.codex-tmp', 'airplay-build-bin');
  mkdirSync(shimDir, { recursive: true });
  const shim = join(shimDir, 'python3');
  const bashPath = pythonPath.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
  writeFileSync(shim, `#!/usr/bin/env bash\nexec "${bashPath}" "$@"\n`, 'utf8');
  chmodSync(shim, 0o755);
  return shimDir;
};

const patchNodeLibraopWindowsBuild = () => {
  const packageRoot = dirname(require.resolve('@lox-audioserver/node-libraop/package.json'));
  const bindingPath = join(packageRoot, 'binding.gyp');
  let binding = readFileSync(bindingPath, 'utf8');
  if (!binding.includes('-lpthreadVC3')) {
    binding = binding.replace(
      '"-lbcrypt"',
      '"-lbcrypt",\n            "-lpthreadVC3"',
    );
    writeFileSync(bindingPath, binding, 'utf8');
  }

  const platformPath = join(packageRoot, 'vendor', 'libraop', 'crosstools', 'src', 'platform.h');
  let platform = readFileSync(platformPath, 'utf8');
  if (!platform.includes('#include <sys/timeb.h>\n#include <pthread.h>')) {
    platform = platform.replace(
      '#include <sys/timeb.h>',
      '#include <sys/timeb.h>\n#include <pthread.h>',
    );
    writeFileSync(platformPath, platform, 'utf8');
  }
};

try {
  if (process.platform !== 'win32') {
    fail('This spike build script currently targets Windows only.');
    process.exit();
  }

  const visualStudio = findVisualStudio();
  if (!visualStudio) {
    fail('Visual Studio 2022 Build Tools with MSBuild were not found.', [
      'Install VS 2022 Build Tools with Desktop development with C++ and Windows SDK.',
    ]);
    process.exit();
  }

  const openSslRoot = findOpenSsl();
  if (!openSslRoot) {
    fail('OpenSSL x64 headers/libs were not found.', [
      'Install Win64 OpenSSL or vcpkg openssl:x64-windows.',
      'Set OPENSSL_ROOT_DIR to the folder that contains include\\openssl\\ssl.h and lib\\.',
      'The currently detected OpenSSL-Win32 runtime folder is not enough for native compilation.',
    ]);
    process.exit();
  }
  const gitBashBin = findGitBash();
  if (!gitBashBin) {
    fail('Git Bash was not found, but node-libraop needs bash to prepare vendored libraop sources.', [
      'Install Git for Windows or make bash.exe available on PATH before C:\\Windows\\system32\\bash.exe.',
    ]);
    process.exit();
  }
  const pythonPath = findPython();
  if (!pythonPath) {
    fail('Python was not found for the libraop preparation script.', [
      'Install Python 3 and make python.exe available on PATH.',
    ]);
    process.exit();
  }
  const pythonShimDir = createPython3Shim(pythonPath);
  patchNodeLibraopWindowsBuild();

  try {
    require.resolve('@lox-audioserver/node-libraop/package.json');
  } catch {
    fail('@lox-audioserver/node-libraop is not installed in node_modules.', [
      'Run npm install --include=optional --ignore-scripts first, then rerun npm run build:airplay-raop.',
    ]);
    process.exit();
  }

  const env = {
    ...process.env,
    OPENSSL_ROOT_DIR: openSslRoot,
    npm_config_build_from_source: 'true',
    npm_config_openssl_root: openSslRoot,
    INCLUDE: [
      join(openSslRoot, 'include'),
      process.env.INCLUDE ?? '',
    ].filter(Boolean).join(';'),
    LIB: [
      join(openSslRoot, 'lib'),
      process.env.LIB ?? '',
    ].filter(Boolean).join(';'),
    PATH: [
      pythonShimDir,
      gitBashBin,
      dirname(visualStudio.msbuild),
      visualStudio.vcBin,
      join(openSslRoot, 'bin'),
      process.env.PATH ?? '',
    ].filter(Boolean).join(';'),
  };

  console.log(`[build:airplay-raop] Visual Studio: ${visualStudio.installationPath}`);
  if (visualStudio.vcBin) {
    console.log(`[build:airplay-raop] MSVC x64: ${visualStudio.vcBin}`);
  }
  console.log(`[build:airplay-raop] OpenSSL: ${openSslRoot}`);
  console.log(`[build:airplay-raop] Bash: ${join(gitBashBin, 'bash.exe')}`);
  console.log(`[build:airplay-raop] Python: ${pythonPath}`);
  if (process.platform === 'win32') {
    run('cmd.exe', ['/d', '/s', '/c', `${npmCommand} rebuild @lox-audioserver/node-libraop --build-from-source`], { env });
  } else {
    run(npmCommand, ['rebuild', '@lox-audioserver/node-libraop', '--build-from-source'], { env });
  }
  console.log('[build:airplay-raop] RAOP native module rebuilt.');
} catch (error) {
  fail('Failed to build AirPlay RAOP native module.', [error instanceof Error ? error.message : String(error)]);
}
