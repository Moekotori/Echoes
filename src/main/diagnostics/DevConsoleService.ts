import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserWindow, app } from 'electron';
import type { WebContents } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type {
  DiagnosticConsoleEntry,
  DiagnosticConsoleLevel,
  DiagnosticConsoleSnapshot,
  DiagnosticConsoleSource,
} from '../../shared/types/diagnostics';
import { recordDiagnosticConsoleProblem } from './ExceptionRecorder';

const mainOutputDir = import.meta.dirname;
const appIconPath = join(mainOutputDir, '../../software.ico');
const maxEntries = 2500;
const maxLineLength = 4000;

const pendingChunks = new Map<DiagnosticConsoleSource, string>();
let consoleWindow: BrowserWindow | null = null;
let captureInitialized = false;
let nextEntryId = 1;
let entries: DiagnosticConsoleEntry[] = [];
const ansiSequencePattern = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

const truncateLine = (line: string): string =>
  line.length > maxLineLength ? `${line.slice(0, maxLineLength)}...` : line;

const normalizeLine = (line: string): string => line.replace(ansiSequencePattern, '');

const isMutedDiagnosticLine = (
  source: DiagnosticConsoleSource,
  level: DiagnosticConsoleLevel,
  message: string,
): boolean => {
  const plainMessage = normalizeLine(message).trim();

  if (source === 'renderer' && (level === 'warn' || level === 'error')) {
    return (
      plainMessage.startsWith('MediaImage src can only be of http/https/data/blob scheme:') ||
      plainMessage.startsWith('Unable to preventDefault inside passive event listener invocation.')
    );
  }

  if (source === 'stderr') {
    return (
      plainMessage.startsWith('[BpmAnalyzer] file=') ||
      plainMessage.startsWith('[DecoderPipeline] ffmpeg:') ||
      /"event":"local_prepare_(?:started|completed)"/u.test(plainMessage)
    );
  }

  return false;
};

const pushEntry = (
  source: DiagnosticConsoleSource,
  level: DiagnosticConsoleLevel,
  message: string,
  details?: DiagnosticConsoleEntry['details'],
): DiagnosticConsoleEntry => {
  if (isMutedDiagnosticLine(source, level, message)) {
    return {
      id: nextEntryId,
      timestamp: new Date().toISOString(),
      source,
      level,
      message,
      details,
    };
  }

  const rawMessage = truncateLine(message);
  const plainMessage = truncateLine(normalizeLine(message));
  const entry: DiagnosticConsoleEntry = {
    id: nextEntryId,
    timestamp: new Date().toISOString(),
    source,
    level,
    message: plainMessage,
    rawMessage: rawMessage === plainMessage ? undefined : rawMessage,
    details,
  };

  nextEntryId += 1;
  entries.push(entry);
  if (entries.length > maxEntries) {
    entries.splice(0, entries.length - maxEntries);
  }
  recordDiagnosticConsoleProblem(entry);

  const windows = typeof BrowserWindow?.getAllWindows === 'function' ? BrowserWindow.getAllWindows() : [];
  for (const window of windows) {
    if (window.isDestroyed()) {
      continue;
    }

    const isConsoleWindow = consoleWindow !== null && !consoleWindow.isDestroyed() && window.id === consoleWindow.id;
    if (!isConsoleWindow) {
      continue;
    }

    const send = (): void => {
      if (!window.isDestroyed()) {
        window.webContents.send(IpcChannels.DiagnosticsDevConsoleEntry, entry);
      }
    };

    if (!window.webContents.isLoading()) {
      send();
    }
  }

  return entry;
};

export const recordDevConsoleSystemEntry = (message: string): DiagnosticConsoleEntry =>
  pushEntry('system', 'info', message);

const textFromChunk = (chunk: unknown, encoding?: BufferEncoding): string => {
  if (typeof chunk === 'string') {
    return chunk;
  }

  if (Buffer.isBuffer(chunk)) {
    return chunk.toString(encoding ?? 'utf8');
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk).toString(encoding ?? 'utf8');
  }

  return '';
};

const appendStreamChunk = (
  source: DiagnosticConsoleSource,
  level: DiagnosticConsoleLevel,
  chunk: unknown,
  encoding?: BufferEncoding,
): void => {
  const text = textFromChunk(chunk, encoding);
  if (!text) {
    return;
  }

  const previous = pendingChunks.get(source) ?? '';
  const lines = `${previous}${text}`.split(/\r?\n|\r/g);
  const tail = lines.pop() ?? '';
  pendingChunks.set(source, tail);

  for (const line of lines) {
    if (line.trim()) {
      pushEntry(source, level, line);
    }
  }

  if (tail.length >= maxLineLength) {
    pendingChunks.set(source, '');
    pushEntry(source, level, tail);
  }
};

const patchWriteStream = (
  stream: NodeJS.WriteStream | undefined,
  source: DiagnosticConsoleSource,
  level: DiagnosticConsoleLevel,
): void => {
  if (!stream?.write) {
    return;
  }

  const originalWrite = stream.write.bind(stream);
  const patchedWrite = ((
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ): boolean => {
    let result: boolean;
    if (typeof encodingOrCallback === 'function') {
      result = originalWrite(chunk, encodingOrCallback);
    } else if (typeof encodingOrCallback === 'string') {
      result = originalWrite(chunk, encodingOrCallback, callback);
    } else {
      result = originalWrite(chunk);
    }

    appendStreamChunk(source, level, chunk, typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined);
    return result;
  }) as NodeJS.WriteStream['write'];

  stream.write = patchedWrite;
};

export const initializeDevConsoleCapture = (): void => {
  if (captureInitialized) {
    return;
  }

  captureInitialized = true;
  pushEntry('system', 'info', 'ECHO Next debug console capture started.');
  patchWriteStream(process.stdout, 'stdout', 'info');
  patchWriteStream(process.stderr, 'stderr', 'error');
};

const rendererLevelFromConsoleMessage = (level: unknown): DiagnosticConsoleLevel => {
  if (typeof level === 'string') {
    if (level === 'error' || level === 'warning' || level === 'warn' || level === 'info' || level === 'debug' || level === 'log') {
      return level === 'warning' ? 'warn' : level;
    }
    return 'log';
  }

  if (level === 3) {
    return 'error';
  }

  if (level === 2) {
    return 'warn';
  }

  if (level === 1) {
    return 'info';
  }

  return 'log';
};

export const recordRendererConsoleMessage = (details: {
  level?: unknown;
  message?: string;
  lineNumber?: number;
  sourceId?: string;
}): void => {
  const message = typeof details.message === 'string' ? details.message : '';
  if (!message.trim()) {
    return;
  }

  pushEntry('renderer', rendererLevelFromConsoleMessage(details.level), message, {
    line: details.lineNumber,
    sourceId: details.sourceId,
  });
};

const resolveDevConsolePreloadPath = (baseDir = mainOutputDir): string => {
  const mjsPreload = join(baseDir, '../preload/devConsole.mjs');

  if (existsSync(mjsPreload)) {
    return mjsPreload;
  }

  return join(baseDir, '../preload/devConsole.js');
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const createDevConsoleHtml = (): string => {
  const title = 'ECHO Debug Console';
  const note = '实时显示主进程 stdout/stderr 与渲染器 console，方便像 npm run dev 一样排查问题。';

  return `<!doctype html>
<html lang="zh-Hans">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; script-src 'unsafe-inline'; style-src 'unsafe-inline';" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #080c11;
      --panel: #0f151d;
      --border: #263446;
      --text: #dce5f2;
      --muted: #8390a3;
      --soft: #a9b5c6;
      --accent: #6ee7b7;
      --warn: #facc15;
      --error: #fb7185;
      font-family: Consolas, "Cascadia Mono", "JetBrains Mono", monospace;
    }
    * { box-sizing: border-box; }
    body { margin: 0; height: 100vh; overflow: hidden; display: flex; flex-direction: column; background: var(--bg); color: var(--text); }
    .toolbar { display: grid; grid-template-columns: minmax(260px, 1fr) auto; gap: 10px; padding: 10px 12px 8px; background: rgba(10, 15, 22, 0.98); border-bottom: 1px solid var(--border); }
    .title { display: flex; flex-direction: column; min-width: 0; }
    h1 { margin: 0; font: 600 14px/1.3 system-ui, sans-serif; letter-spacing: 0; color: #f4f7fb; }
    small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 12px/1.35 system-ui, sans-serif; color: var(--muted); }
    .controls { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 6px; }
    button, select, input { border: 1px solid #334257; border-radius: 6px; background: #101821; color: var(--text); height: 30px; }
    button { padding: 0 10px; cursor: pointer; font: 12px system-ui, sans-serif; white-space: nowrap; }
    button:hover { background: #182434; border-color: #4d6683; }
    button[data-active="true"] { border-color: #6ee7b7; color: #e9fff7; background: #12302d; }
    select { padding: 0 8px; }
    input { width: min(360px, 28vw); min-width: 160px; padding: 0 10px; }
    .summary { display: flex; align-items: center; gap: 6px; padding: 0 12px; height: 34px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); background: var(--panel); font: 12px system-ui, sans-serif; color: var(--soft); overflow-x: auto; }
    .chip { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 5px; min-height: 22px; padding: 2px 8px; border: 1px solid #2c3a4d; border-radius: 999px; background: #0c1219; }
    .chip strong { color: #f4f7fb; font-weight: 600; }
    .chip[data-tone="warn"] strong { color: var(--warn); }
    .chip[data-tone="error"] strong { color: var(--error); }
    .chip[data-tone="ok"] strong { color: var(--accent); }
    .problem-board { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 10px; padding: 10px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.07); background: #0b1118; color: var(--soft); font: 12px system-ui, sans-serif; }
    .problem-board[data-empty="true"] { grid-template-columns: 1fr; }
    .problem-head { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .problem-head strong { color: #f4f7fb; font-size: 13px; }
    .problem-head span { color: var(--muted); line-height: 1.35; }
    .problem-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 6px; min-width: 0; max-height: 136px; overflow: auto; }
    .problem-item { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; align-items: start; min-width: 0; border: 1px solid #2c3a4d; border-radius: 6px; padding: 7px 8px; background: #0f1721; text-align: left; height: auto; color: var(--text); }
    .problem-item:hover { background: #142030; border-color: #506985; }
    .problem-item[data-severity="error"] { border-color: rgba(251, 113, 133, 0.5); }
    .problem-item[data-severity="warn"] { border-color: rgba(250, 204, 21, 0.45); }
    .problem-badge { min-width: 46px; padding-top: 1px; color: var(--accent); font-weight: 700; text-transform: uppercase; }
    .problem-item[data-severity="error"] .problem-badge { color: var(--error); }
    .problem-item[data-severity="warn"] .problem-badge { color: var(--warn); }
    .problem-copy { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
    .problem-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: #f4f7fb; }
    .problem-copy span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #9aa8bb; }
    .problem-empty { color: var(--accent); }
    .console { flex: 1; overflow: auto; padding: 8px 12px 22px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 1.5; background: linear-gradient(#080c11, #090d13); }
    .console[data-wrap="false"] { white-space: pre; overflow-wrap: normal; }
    .line { display: grid; grid-template-columns: 58px 96px 72px 74px minmax(0, 1fr); gap: 8px; align-items: start; min-height: 20px; padding: 1px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.025); }
    .line:hover { background: rgba(255, 255, 255, 0.035); }
    .id { color: #4f5f73; text-align: right; user-select: none; }
    .time { color: #718096; }
    .source { color: #93c5fd; }
    .level { color: #a7f3d0; }
    .msg { color: #d7dde7; }
    .line[data-level="debug"] .level { color: #94a3b8; }
    .line[data-level="warn"] .level, .line[data-level="warning"] .level { color: var(--warn); }
    .line[data-level="error"] .level, .line[data-source="stderr"] .level { color: var(--error); }
    .line[data-source="stderr"] .msg { color: #fecdd3; }
    .line[data-source="renderer"] .source { color: #c4b5fd; }
    .line[data-source="system"] .source { color: #f9a8d4; }
    .details { color: #66758a; }
    .empty { padding: 30px 12px; color: #738096; font: 13px system-ui, sans-serif; }
    .ansi-bold { font-weight: 700; }
    .ansi-dim { opacity: 0.7; }
    .ansi-underline { text-decoration: underline; }
    .ansi-fg-30 { color: #111827; } .ansi-fg-31 { color: #ef4444; } .ansi-fg-32 { color: #22c55e; } .ansi-fg-33 { color: #eab308; }
    .ansi-fg-34 { color: #60a5fa; } .ansi-fg-35 { color: #c084fc; } .ansi-fg-36 { color: #22d3ee; } .ansi-fg-37 { color: #e5e7eb; }
    .ansi-fg-90 { color: #64748b; } .ansi-fg-91 { color: #fb7185; } .ansi-fg-92 { color: #4ade80; } .ansi-fg-93 { color: #fde047; }
    .ansi-fg-94 { color: #93c5fd; } .ansi-fg-95 { color: #d8b4fe; } .ansi-fg-96 { color: #67e8f9; } .ansi-fg-97 { color: #ffffff; }
    .ansi-bg-40 { background: #111827; } .ansi-bg-41 { background: #7f1d1d; } .ansi-bg-42 { background: #14532d; } .ansi-bg-43 { background: #713f12; }
    .ansi-bg-44 { background: #1e3a8a; } .ansi-bg-45 { background: #581c87; } .ansi-bg-46 { background: #164e63; } .ansi-bg-47 { background: #e5e7eb; color: #111827; }
    .footer { height: 28px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 12px; border-top: 1px solid rgba(255, 255, 255, 0.06); background: var(--panel); color: var(--muted); font: 12px system-ui, sans-serif; }
    @media (max-width: 860px) {
      .toolbar { grid-template-columns: 1fr; }
      .controls { justify-content: flex-start; }
      input { width: 100%; }
      .problem-board { grid-template-columns: 1fr; }
      .line { grid-template-columns: 48px 84px 64px minmax(0, 1fr); }
      .source { display: none; }
    }
  </style>
</head>
<body>
  <header class="toolbar">
    <div class="title">
      <h1>${escapeHtml(title)}</h1>
      <small>${escapeHtml(note)}</small>
    </div>
    <div class="controls">
      <input id="filter" aria-label="filter" placeholder="搜索日志 / Ctrl+F" />
      <select id="source" aria-label="source">
        <option value="">全部来源</option>
        <option value="stdout">stdout</option>
        <option value="stderr">stderr</option>
        <option value="renderer">renderer</option>
        <option value="system">system</option>
      </select>
      <select id="level" aria-label="level">
        <option value="">全部级别</option>
        <option value="error">error</option>
        <option value="warn">warn</option>
        <option value="info">info</option>
        <option value="debug">debug</option>
        <option value="log">log</option>
      </select>
      <button id="problems" type="button">错误/警告</button>
      <button id="autoscroll" type="button" data-active="true">自动滚动</button>
      <button id="wrap" type="button" data-active="true">换行</button>
      <button id="bottom" type="button">到底部</button>
      <button id="pause" type="button">暂停</button>
      <button id="clear" type="button">清空</button>
      <button id="copy" type="button">复制可见</button>
      <button id="save" type="button">保存 .log</button>
      <button id="devtools" type="button">DevTools</button>
    </div>
  </header>
  <section class="summary" aria-live="polite">
    <span class="chip">可见 <strong id="visibleCount">0</strong></span>
    <span class="chip">总数 <strong id="totalCount">0</strong></span>
    <span class="chip" data-tone="error">error <strong id="errorCount">0</strong></span>
    <span class="chip" data-tone="warn">warn <strong id="warnCount">0</strong></span>
    <span class="chip" data-tone="error">stderr <strong id="stderrCount">0</strong></span>
    <span class="chip" data-tone="ok">renderer <strong id="rendererCount">0</strong></span>
    <span class="chip">未读 <strong id="unreadCount">0</strong></span>
  </section>
  <section id="problemBoard" class="problem-board" data-empty="true" aria-live="polite"></section>
  <main id="console" class="console" data-wrap="true" aria-live="polite"></main>
  <footer class="footer">
    <span id="status">等待日志...</span>
    <span>Ctrl+F 搜索 · Ctrl+L 清空 · End 到底部</span>
  </footer>
  <script>
    const api = window.echoDevConsole;
    const consoleEl = document.getElementById('console');
    const filterEl = document.getElementById('filter');
    const sourceEl = document.getElementById('source');
    const levelEl = document.getElementById('level');
    const problemsButton = document.getElementById('problems');
    const autoScrollButton = document.getElementById('autoscroll');
    const wrapButton = document.getElementById('wrap');
    const bottomButton = document.getElementById('bottom');
    const pauseButton = document.getElementById('pause');
    const clearButton = document.getElementById('clear');
    const copyButton = document.getElementById('copy');
    const saveButton = document.getElementById('save');
    const devtoolsButton = document.getElementById('devtools');
    const problemBoardEl = document.getElementById('problemBoard');
    const statusEl = document.getElementById('status');
    const visibleCountEl = document.getElementById('visibleCount');
    const totalCountEl = document.getElementById('totalCount');
    const errorCountEl = document.getElementById('errorCount');
    const warnCountEl = document.getElementById('warnCount');
    const stderrCountEl = document.getElementById('stderrCount');
    const rendererCountEl = document.getElementById('rendererCount');
    const unreadCountEl = document.getElementById('unreadCount');
    let entries = [];
    let paused = false;
    let onlyProblems = false;
    let autoScroll = true;
    let wrapLines = true;
    let unread = 0;
    const ansiCodePattern = /\\u001b\\[([0-9;?]*)m/g;
    const ansiStripPattern = /\\u001b\\[[0-9;?]*[ -/]*[@-~]/g;
    const fgCodes = new Set(['30', '31', '32', '33', '34', '35', '36', '37', '90', '91', '92', '93', '94', '95', '96', '97']);
    const bgCodes = new Set(['40', '41', '42', '43', '44', '45', '46', '47']);

    const timePart = (timestamp) => {
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) {
        return timestamp;
      }
      const pad = (value, size) => String(value).padStart(size, '0');
      return pad(date.getHours(), 2) + ':' + pad(date.getMinutes(), 2) + ':' + pad(date.getSeconds(), 2) + '.' + pad(date.getMilliseconds(), 3);
    };

    const isNearBottom = () => consoleEl.scrollTop + consoleEl.clientHeight >= consoleEl.scrollHeight - 48;
    const isProblemEntry = (entry) => entry.source === 'stderr' || entry.level === 'error' || entry.level === 'warn';
    const problemSeverity = (entry) => entry.level === 'error' || entry.source === 'stderr' ? 'error' : 'warn';
    const passesFilters = (entry) => {
      const query = filterEl.value.trim().toLowerCase();
      const source = sourceEl.value;
      const level = levelEl.value;
      if (source && entry.source !== source) {
        return false;
      }
      if (level && entry.level !== level) {
        return false;
      }
      if (onlyProblems && !isProblemEntry(entry)) {
        return false;
      }
      if (!query) {
        return true;
      }
      const detailText = entry.details ? String(entry.details.sourceId || '') + ':' + String(entry.details.line || '') : '';
      return entry.message.toLowerCase().includes(query) ||
        entry.source.toLowerCase().includes(query) ||
        entry.level.toLowerCase().includes(query) ||
        detailText.toLowerCase().includes(query);
    };

    const clearAnsiClass = (classSet, prefix) => {
      for (const className of Array.from(classSet)) {
        if (className.startsWith(prefix)) {
          classSet.delete(className);
        }
      }
    };
    const applyAnsiCodes = (codes, classSet) => {
      const parts = codes ? codes.split(';').filter(Boolean) : ['0'];
      for (const code of parts.length ? parts : ['0']) {
        if (code === '0') {
          classSet.clear();
        } else if (code === '1') {
          classSet.add('ansi-bold');
        } else if (code === '2') {
          classSet.add('ansi-dim');
        } else if (code === '4') {
          classSet.add('ansi-underline');
        } else if (code === '22') {
          classSet.delete('ansi-bold');
          classSet.delete('ansi-dim');
        } else if (code === '24') {
          classSet.delete('ansi-underline');
        } else if (code === '39') {
          clearAnsiClass(classSet, 'ansi-fg-');
        } else if (code === '49') {
          clearAnsiClass(classSet, 'ansi-bg-');
        } else if (fgCodes.has(code)) {
          clearAnsiClass(classSet, 'ansi-fg-');
          classSet.add('ansi-fg-' + code);
        } else if (bgCodes.has(code)) {
          clearAnsiClass(classSet, 'ansi-bg-');
          classSet.add('ansi-bg-' + code);
        }
      }
    };
    const appendAnsiText = (container, value) => {
      const classSet = new Set();
      let cursor = 0;
      let match;
      const append = (text) => {
        const clean = text.replace(ansiStripPattern, '');
        if (!clean) {
          return;
        }
        const span = document.createElement('span');
        span.textContent = clean;
        if (classSet.size) {
          span.className = Array.from(classSet).join(' ');
        }
        container.append(span);
      };
      ansiCodePattern.lastIndex = 0;
      while ((match = ansiCodePattern.exec(value)) !== null) {
        append(value.slice(cursor, match.index));
        applyAnsiCodes(match[1], classSet);
        cursor = ansiCodePattern.lastIndex;
      }
      append(value.slice(cursor));
    };
    const formatEntryLine = (entry) => {
      const details = entry.details && entry.details.sourceId ? ' (' + entry.details.sourceId + (entry.details.line ? ':' + entry.details.line : '') + ')' : '';
      return '[' + entry.timestamp + '] [' + entry.source + '] [' + entry.level + '] ' + entry.message + details;
    };
    const compactProblemText = (value, maxLength) => {
      const text = String(value || '').replace(/\\s+/g, ' ').trim();
      return text.length > maxLength ? text.slice(0, maxLength - 1) + '...' : text;
    };
    const renderProblemBoard = () => {
      const problems = entries.filter(isProblemEntry).slice(-12).reverse();
      problemBoardEl.replaceChildren();
      problemBoardEl.dataset.empty = String(problems.length === 0);

      const head = document.createElement('div');
      head.className = 'problem-head';
      const title = document.createElement('strong');
      title.textContent = problems.length ? '问题一览' : '问题一览：暂无异常';
      const hint = document.createElement('span');
      hint.textContent = problems.length
        ? '最近 stderr/error/warn 会自动浮到这里；点击条目可定位同类日志。'
        : '安全模式会持续捕获主进程、渲染器和启动异常。';
      head.append(title, hint);
      problemBoardEl.append(head);

      if (problems.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'problem-empty';
        empty.textContent = '当前没有捕获到高风险日志。';
        problemBoardEl.append(empty);
        return;
      }

      const list = document.createElement('div');
      list.className = 'problem-list';
      for (const entry of problems) {
        const item = document.createElement('button');
        item.className = 'problem-item';
        item.type = 'button';
        item.dataset.severity = problemSeverity(entry);
        item.title = formatEntryLine(entry);
        item.addEventListener('click', () => {
          onlyProblems = true;
          sourceEl.value = entry.source;
          levelEl.value = entry.level;
          render();
        });
        const badge = document.createElement('span');
        badge.className = 'problem-badge';
        badge.textContent = problemSeverity(entry);
        const copy = document.createElement('span');
        copy.className = 'problem-copy';
        const main = document.createElement('strong');
        main.textContent = compactProblemText(entry.message, 120);
        const meta = document.createElement('span');
        meta.textContent = '#' + entry.id + ' · ' + timePart(entry.timestamp) + ' · ' + entry.source + '/' + entry.level;
        copy.append(main, meta);
        item.append(badge, copy);
        list.append(item);
      }
      problemBoardEl.append(list);
    };
    const setTemporaryButtonText = (button, text) => {
      const original = button.textContent;
      button.textContent = text;
      window.setTimeout(() => {
        button.textContent = original;
      }, 1200);
    };
    const renderStats = (visible) => {
      const total = entries.length;
      const errors = entries.filter((entry) => entry.level === 'error').length;
      const warns = entries.filter((entry) => entry.level === 'warn').length;
      const stderrs = entries.filter((entry) => entry.source === 'stderr').length;
      const renderers = entries.filter((entry) => entry.source === 'renderer').length;
      visibleCountEl.textContent = String(visible.length);
      totalCountEl.textContent = String(total);
      errorCountEl.textContent = String(errors);
      warnCountEl.textContent = String(warns);
      stderrCountEl.textContent = String(stderrs);
      rendererCountEl.textContent = String(renderers);
      unreadCountEl.textContent = String(unread);
      problemsButton.dataset.active = String(onlyProblems);
      autoScrollButton.dataset.active = String(autoScroll);
      wrapButton.dataset.active = String(wrapLines);
      autoScrollButton.textContent = autoScroll ? '自动滚动' : '手动滚动';
      wrapButton.textContent = wrapLines ? '换行' : '不换行';
      pauseButton.textContent = paused ? '继续' + (unread ? ' +' + unread : '') : '暂停';
      statusEl.textContent = total ? '最近一条 #' + entries[entries.length - 1].id + ' · ' + timePart(entries[entries.length - 1].timestamp) : '等待日志...';
    };
    const scrollToBottom = () => {
      consoleEl.scrollTop = consoleEl.scrollHeight;
      unread = 0;
      renderStats(entries.filter(passesFilters));
    };
    const render = () => {
      const stick = autoScroll && isNearBottom();
      const visible = entries.filter(passesFilters);
      consoleEl.replaceChildren();
      if (!visible.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = entries.length ? '没有匹配的日志。' : '还没有日志。';
        consoleEl.append(empty);
      } else {
        const fragment = document.createDocumentFragment();
        for (const entry of visible) {
          const row = document.createElement('div');
          row.className = 'line';
          row.dataset.level = entry.level;
          row.dataset.source = entry.source;
          const details = entry.details && entry.details.sourceId ? entry.details.sourceId + (entry.details.line ? ':' + entry.details.line : '') : '';
          if (details) {
            row.title = details;
          }
          const id = document.createElement('span');
          id.className = 'id';
          id.textContent = '#' + entry.id;
          const time = document.createElement('span');
          time.className = 'time';
          time.textContent = timePart(entry.timestamp);
          const source = document.createElement('span');
          source.className = 'source';
          source.textContent = entry.source;
          const level = document.createElement('span');
          level.className = 'level';
          level.textContent = entry.level;
          const msg = document.createElement('span');
          msg.className = 'msg';
          appendAnsiText(msg, entry.rawMessage || entry.message);
          if (details) {
            const detailsSpan = document.createElement('span');
            detailsSpan.className = 'details';
            detailsSpan.textContent = '  ' + details;
            msg.append(detailsSpan);
          }
          row.append(id, time, source, level, msg);
          fragment.append(row);
        }
        consoleEl.append(fragment);
      }
      renderStats(visible);
      renderProblemBoard();
      consoleEl.dataset.wrap = String(wrapLines);
      if (stick && !paused) {
        scrollToBottom();
      }
    };

    api.getSnapshot().then((snapshot) => {
      entries = snapshot.entries;
      render();
      scrollToBottom();
    }).catch((error) => {
      entries = [{ id: 0, timestamp: new Date().toISOString(), source: 'system', level: 'error', message: String(error) }];
      render();
    });

    api.onEntry((entry) => {
      entries = [...entries, entry].slice(-2500);
      if (paused) {
        unread += 1;
        renderStats(entries.filter(passesFilters));
        return;
      }
      if (!autoScroll || !isNearBottom()) {
        unread += 1;
      }
      render();
    });

    filterEl.addEventListener('input', render);
    sourceEl.addEventListener('change', render);
    levelEl.addEventListener('change', render);
    problemsButton.addEventListener('click', () => {
      onlyProblems = !onlyProblems;
      render();
    });
    autoScrollButton.addEventListener('click', () => {
      autoScroll = !autoScroll;
      if (autoScroll) {
        scrollToBottom();
      }
      render();
    });
    wrapButton.addEventListener('click', () => {
      wrapLines = !wrapLines;
      render();
    });
    bottomButton.addEventListener('click', () => {
      scrollToBottom();
    });
    pauseButton.addEventListener('click', () => {
      paused = !paused;
      if (!paused) {
        unread = 0;
        render();
        if (autoScroll) {
          scrollToBottom();
        }
      } else {
        renderStats(entries.filter(passesFilters));
      }
    });
    clearButton.addEventListener('click', () => {
      entries = [];
      unread = 0;
      api.clear().finally(render);
    });
    copyButton.addEventListener('click', () => {
      const text = entries.filter(passesFilters).map(formatEntryLine).join('\\n');
      navigator.clipboard.writeText(text).then(() => setTemporaryButtonText(copyButton, '已复制')).catch(() => setTemporaryButtonText(copyButton, '复制失败'));
    });
    saveButton.addEventListener('click', () => {
      const text = entries.filter(passesFilters).map(formatEntryLine).join('\\n');
      const blob = new Blob([text + '\\n'], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      anchor.href = url;
      anchor.download = 'echo-debug-console-' + stamp + '.log';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setTemporaryButtonText(saveButton, '已保存');
    });
    devtoolsButton.addEventListener('click', () => {
      api.openDevTools().catch(() => undefined);
    });
    document.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;
      if (mod && key === 'f') {
        event.preventDefault();
        filterEl.focus();
        filterEl.select();
      } else if (mod && key === 'l') {
        event.preventDefault();
        entries = [];
        unread = 0;
        api.clear().finally(render);
      } else if (event.key === 'Escape' && document.activeElement === filterEl && filterEl.value) {
        filterEl.value = '';
        render();
      } else if (event.key === 'End') {
        scrollToBottom();
      }
    });
  </script>
</body>
</html>`;
};

export const getDevConsoleSnapshot = (): DiagnosticConsoleSnapshot => ({
  entries,
  maxEntries,
});

export const clearDevConsole = (): void => {
  entries = [];
  pendingChunks.clear();
  pushEntry('system', 'info', 'Debug console cleared.');
};

export const openDevConsoleDevTools = (sender: WebContents): void => {
  const owner = BrowserWindow.fromWebContents(sender);
  owner?.webContents.openDevTools({ mode: 'detach' });
};

export const openDevConsoleWindow = (): void => {
  initializeDevConsoleCapture();

  if (consoleWindow && !consoleWindow.isDestroyed()) {
    if (consoleWindow.isMinimized()) {
      consoleWindow.restore();
    }
    consoleWindow.show();
    consoleWindow.focus();
    return;
  }

  consoleWindow = new BrowserWindow({
    width: 1240,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: 'ECHO Debug Console',
    icon: existsSync(appIconPath) ? appIconPath : undefined,
    backgroundColor: '#080c11',
    show: false,
    webPreferences: {
      preload: resolveDevConsolePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  consoleWindow.once('ready-to-show', () => {
    consoleWindow?.show();
  });
  consoleWindow.on('closed', () => {
    consoleWindow = null;
  });
  consoleWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  consoleWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('data:text/html')) {
      event.preventDefault();
    }
  });

  void consoleWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(createDevConsoleHtml())}`);
  pushEntry('system', 'info', `Debug console opened. userData=${app.getPath('userData')}`);
};
