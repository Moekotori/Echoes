import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), '..');
const hostPath = join(projectRoot, 'electron-app', 'build', process.platform === 'win32' ? 'echo-audio-host.exe' : 'echo-audio-host');

const fail = (message) => {
  console.error(`[smoke:audio-host] ${message}`);
  process.exit(1);
};

if (!existsSync(hostPath)) {
  fail(`Missing host binary: ${hostPath}. Run "npm run build:audio-host" first.`);
}

const runList = (args) => spawnSync(hostPath, args, {
  cwd: projectRoot,
  encoding: 'utf8',
});

const parseDeviceLines = (stdout) => stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const parseJsonLines = (stdout) => stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const runPcmHost = async (args, { timeoutMs = 15000, sampleRate = 48000, seconds = 0.1 } = {}) => {
  const child = spawn(hostPath, args, {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let stdinError = '';

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  child.stdin.on('error', (error) => {
    stdinError = error instanceof Error ? error.message : String(error);
  });

  const channels = 2;
  const frames = Math.floor(seconds * sampleRate);
  const pcm = Buffer.alloc(frames * channels * Float32Array.BYTES_PER_ELEMENT);

  for (let frame = 0; frame < frames; frame += 1) {
    const sample = Math.sin((frame / sampleRate) * Math.PI * 2 * 440) * 0.02;
    for (let channel = 0; channel < channels; channel += 1) {
      pcm.writeFloatLE(sample, (frame * channels + channel) * Float32Array.BYTES_PER_ELEMENT);
    }
  }

  child.stdin.write(pcm, (error) => {
    if (error) {
      stdinError = error.message;
    }
  });
  child.stdin.end();

  const exitCode = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(-1);
    }, timeoutMs);

    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code ?? 0);
    });
  });

  return {
    exitCode,
    stdout,
    stderr,
    stdinError,
    events: parseJsonLines(stdout),
  };
};

const assertNoSharedFallback = (label, result) => {
  if (result.stdout.includes('"backend":"wasapi-shared"') || result.stdout.includes('"exclusive":false,"backend":"wasapi-shared"')) {
    fail(`${label} fell back to shared output; stderr=${result.stderr}; stdout=${result.stdout}`);
  }
};

const hasAdvancedPosition = (events) => events.some((event) => typeof event.pos === 'number' && event.pos > 0);

const listResult = runList(['-list']);

if (listResult.status !== 0) {
  fail(`-list failed: ${listResult.stderr || listResult.stdout}`);
}

const devices = parseDeviceLines(listResult.stdout);

if (devices.length === 0) {
  fail('-list returned no output devices');
}

console.log(`[smoke:audio-host] listed ${devices.length} output devices`);

const sharedResult = await runPcmHost(['-sr', '48000', '-ch', '2'], {
  timeoutMs: 10000,
  sampleRate: 48000,
  seconds: 0.25,
});

if (sharedResult.exitCode !== 0) {
  fail(`shared host exited with ${sharedResult.exitCode}; stdin=${sharedResult.stdinError || 'ok'}; stderr=${sharedResult.stderr}; stdout=${sharedResult.stdout}`);
}

let ready = sharedResult.events.some((event) => event.ready === true);
let position = sharedResult.events.some((event) => typeof event.pos === 'number');
let ended = sharedResult.events.some((event) => event.event === 'ended');
let telemetry = sharedResult.events.some((event) =>
  typeof event.pos === 'number' &&
  typeof event.bufferedFrames === 'number' &&
  typeof event.underrunCallbacks === 'number' &&
  typeof event.underrunFrames === 'number'
);

if (!ready || !position || !telemetry || !ended) {
  fail(`missing expected shared events ready=${ready} position=${position} telemetry=${telemetry} ended=${ended}; stderr=${sharedResult.stderr}; stdout=${sharedResult.stdout}`);
}

console.log('[smoke:audio-host] shared ready/position/telemetry/ended OK');

const asioListResult = runList(['-list', '-asio']);
const asioDevices = parseDeviceLines(asioListResult.stdout);

if (asioListResult.status === 0) {
  console.log(`[smoke:audio-host] ASIO list returned ${asioDevices.length} device(s)`);
} else {
  const diagnostic = `${asioListResult.stderr || ''}${asioListResult.stdout || ''}`;
  if (!/ASIO/i.test(diagnostic)) {
    fail(`-list -asio failed without ASIO diagnostic: ${diagnostic}`);
  }
  console.log(`[smoke:audio-host] ASIO list diagnostic OK: ${diagnostic.trim()}`);
}

const exclusiveResult = await runPcmHost(['-sr', '44100', '-ch', '2', '-exclusive'], {
  timeoutMs: 60000,
  sampleRate: 44100,
  seconds: 0.1,
});
const exclusiveReady = exclusiveResult.events.find((event) => event.ready === true);
assertNoSharedFallback('exclusive smoke', exclusiveResult);

if (exclusiveResult.exitCode === 0) {
  if (!exclusiveReady || exclusiveReady.exclusive !== true || exclusiveReady.backend !== 'wasapi-exclusive') {
    fail(`exclusive ready metadata invalid; stderr=${exclusiveResult.stderr}; stdout=${exclusiveResult.stdout}`);
  }
  if (!hasAdvancedPosition(exclusiveResult.events)) {
    fail(`exclusive did not consume PCM frames; stderr=${exclusiveResult.stderr}; stdout=${exclusiveResult.stdout}`);
  }
  console.log(`[smoke:audio-host] exclusive ready OK (${exclusiveReady.deviceType ?? 'unknown device type'})`);
} else if (!/WASAPI exclusive open failed/i.test(exclusiveResult.stderr)) {
  fail(`exclusive failed without explicit diagnostic; exit=${exclusiveResult.exitCode}; stderr=${exclusiveResult.stderr}; stdout=${exclusiveResult.stdout}`);
} else {
  console.log('[smoke:audio-host] exclusive failure diagnostic OK');
}

if (asioListResult.status === 0 && asioDevices.length > 0) {
  const asioResult = await runPcmHost(['-sr', '44100', '-ch', '2', '-asio'], {
    timeoutMs: 30000,
    sampleRate: 44100,
    seconds: 0.1,
  });
  const asioReady = asioResult.events.find((event) => event.ready === true);
  assertNoSharedFallback('ASIO smoke', asioResult);

  if (asioResult.exitCode === 0) {
    if (!asioReady || asioReady.backend !== 'asio' || asioReady.exclusive !== false) {
      fail(`ASIO ready metadata invalid; stderr=${asioResult.stderr}; stdout=${asioResult.stdout}`);
    }
    if (!hasAdvancedPosition(asioResult.events)) {
      fail(`ASIO did not consume PCM frames; stderr=${asioResult.stderr}; stdout=${asioResult.stdout}`);
    }
    console.log(`[smoke:audio-host] ASIO ready OK (${asioReady.deviceName ?? 'unknown device'})`);
  } else if (!/ASIO open failed/i.test(asioResult.stderr)) {
    fail(`ASIO failed without explicit diagnostic; exit=${asioResult.exitCode}; stderr=${asioResult.stderr}; stdout=${asioResult.stdout}`);
  } else {
    console.log('[smoke:audio-host] ASIO failure diagnostic OK');
  }
}
