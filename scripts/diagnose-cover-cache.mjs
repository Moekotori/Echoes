#!/usr/bin/env node
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'

const DB_NAMES = ['metadata-cache-v2.sqlite', 'metadata-cache-v1.sqlite']
const THUMB_DIR = path.join('cover-cache-v2', 'thumb')
const SAMPLE_LIMIT = 20

function printHelp() {
  console.log(`Usage:
  node scripts/diagnose-cover-cache.mjs [--user-data "C:/Users/you/AppData/Roaming/ECHO"] [--json]

Checks ECHO metadata SQLite cache and cover-cache-v2 thumbnails.
The script never prints full cover data URLs.`)
}

function parseArgs(argv = []) {
  const args = {
    userData: '',
    json: false,
    help: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      args.help = true
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--user-data') {
      args.userData = argv[index + 1] || ''
      index += 1
    } else if (arg.startsWith('--user-data=')) {
      args.userData = arg.slice('--user-data='.length)
    }
  }
  return args
}

function getDefaultUserDataPath() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'ECHO')
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'ECHO')
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'ECHO')
}

function fileExists(filePath = '') {
  try {
    return Boolean(filePath && fs.statSync(filePath).isFile())
  } catch {
    return false
  }
}

function dirExists(dirPath = '') {
  try {
    return Boolean(dirPath && fs.statSync(dirPath).isDirectory())
  } catch {
    return false
  }
}

function safeParseMeta(value = '') {
  if (typeof value !== 'string' || !value) return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function toSafeDataUrlSummary(value = '') {
  const text = typeof value === 'string' ? value : ''
  if (!text) return { exists: false, length: 0, preview: '' }
  return {
    exists: true,
    length: text.length,
    preview: `${text.slice(0, 32)}... (${text.length} chars)`
  }
}

function collectThumbFiles(rootDir = '') {
  const files = []
  if (!dirExists(rootDir)) return files
  const stack = [rootDir]
  while (stack.length > 0) {
    const current = stack.pop()
    let entries = []
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.isFile() && /\.(?:jpe?g)$/i.test(entry.name)) {
        try {
          const stat = fs.statSync(fullPath)
          files.push({ path: fullPath, bytes: stat.size })
        } catch {
          // Ignore files that disappear during diagnostics.
        }
      }
    }
  }
  return files
}

function getDbInfo(userDataPath = '') {
  const dbFiles = DB_NAMES.map((name) => {
    const filePath = path.join(userDataPath, name)
    return { name, path: filePath, exists: fileExists(filePath) }
  })
  return {
    files: dbFiles,
    active: dbFiles.find((item) => item.exists) || null
  }
}

function getTableInfo(db, tableName = 'embedded_metadata_cache') {
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName)
    if (!tables) return null
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all()
    const columnNames = new Set(columns.map((column) => column.name))
    const metaColumn = columnNames.has('meta_json')
      ? 'meta_json'
      : columnNames.has('metaJson')
        ? 'metaJson'
        : ''
    if (!columnNames.has('path') || !metaColumn) return null
    return { tableName, metaColumn }
  } catch {
    return null
  }
}

function readSqliteStats(activeDb, warnings) {
  const stats = {
    sqliteTracksTotal: 0,
    metaWithCoverCount: 0,
    metaWithCoverThumbUrlCount: 0,
    metaWithCoverThumbPathCount: 0,
    coverThumbPathFileExistsCount: 0,
    coverThumbPathFileMissingCount: 0,
    coverDataUrlAverageLength: 0,
    coverDataUrlMaxLength: 0,
    samples: []
  }
  if (!activeDb?.path) return stats

  let db = null
  try {
    db = new Database(activeDb.path, { readonly: true, fileMustExist: true })
    const table = getTableInfo(db)
    if (!table) {
      warnings.push(`SQLite table embedded_metadata_cache is missing or incompatible in ${activeDb.name}`)
      return stats
    }

    const rows = db
      .prepare(`SELECT path, ${table.metaColumn} AS meta_json FROM ${table.tableName}`)
      .iterate()
    let coverLengthTotal = 0
    let coverLengthCount = 0
    const samplePool = []

    for (const row of rows) {
      stats.sqliteTracksTotal += 1
      const meta = safeParseMeta(row.meta_json)
      if (!meta) continue

      const cover = typeof meta.cover === 'string' ? meta.cover : ''
      const coverSummary = toSafeDataUrlSummary(cover)
      if (coverSummary.exists) {
        stats.metaWithCoverCount += 1
        coverLengthTotal += coverSummary.length
        coverLengthCount += 1
        stats.coverDataUrlMaxLength = Math.max(stats.coverDataUrlMaxLength, coverSummary.length)
      }

      const coverThumbUrl = typeof meta.coverThumbUrl === 'string' ? meta.coverThumbUrl.trim() : ''
      if (coverThumbUrl) {
        stats.metaWithCoverThumbUrlCount += 1
        if (!/^file:\/\//i.test(coverThumbUrl)) {
          warnings.push(`coverThumbUrl is not file:// for ${row.path}`)
        }
      }

      const coverThumbPath =
        typeof meta.coverThumbPath === 'string' ? meta.coverThumbPath.trim() : ''
      const thumbExists = coverThumbPath ? fileExists(coverThumbPath) : false
      if (coverThumbPath) {
        stats.metaWithCoverThumbPathCount += 1
        if (thumbExists) {
          stats.coverThumbPathFileExistsCount += 1
        } else {
          stats.coverThumbPathFileMissingCount += 1
          warnings.push(`coverThumbPath file missing for ${row.path}: ${coverThumbPath}`)
        }
      }

      if (samplePool.length < SAMPLE_LIMIT) {
        samplePool.push({ row, meta, coverSummary, thumbExists })
      } else {
        const pick = Math.floor(Math.random() * stats.sqliteTracksTotal)
        if (pick < SAMPLE_LIMIT) samplePool[pick] = { row, meta, coverSummary, thumbExists }
      }
    }

    stats.coverDataUrlAverageLength =
      coverLengthCount > 0 ? Math.round(coverLengthTotal / coverLengthCount) : 0
    stats.samples = samplePool.map(({ row, meta, coverSummary, thumbExists }) => ({
      title: meta.title || '',
      artist: meta.artist || '',
      album: meta.album || '',
      path: row.path || '',
      cover: {
        exists: coverSummary.exists,
        length: coverSummary.length
      },
      coverThumbPath: meta.coverThumbPath || '',
      thumbFileExists: thumbExists,
      coverKey: meta.coverKey || ''
    }))
  } catch (error) {
    warnings.push(`SQLite read failed: ${error?.message || error}`)
  } finally {
    try {
      db?.close()
    } catch {
      // Ignore close errors in a read-only diagnostic.
    }
  }
  return stats
}

function buildReport({ userDataPath }) {
  const warnings = []
  const db = getDbInfo(userDataPath)
  const thumbDir = path.join(userDataPath, THUMB_DIR)
  const thumbFiles = collectThumbFiles(thumbDir)
  const thumbBytesTotal = thumbFiles.reduce((sum, file) => sum + file.bytes, 0)
  const sqlite = readSqliteStats(db.active, warnings)

  return {
    userDataPath,
    checkedAt: new Date().toISOString(),
    sqlite: {
      files: db.files,
      activeName: db.active?.name || '',
      activePath: db.active?.path || '',
      tracksTotal: sqlite.sqliteTracksTotal,
      metaWithCoverCount: sqlite.metaWithCoverCount,
      metaWithCoverThumbUrlCount: sqlite.metaWithCoverThumbUrlCount,
      metaWithCoverThumbPathCount: sqlite.metaWithCoverThumbPathCount,
      coverThumbPathFileExistsCount: sqlite.coverThumbPathFileExistsCount,
      coverThumbPathFileMissingCount: sqlite.coverThumbPathFileMissingCount,
      coverDataUrlAverageLength: sqlite.coverDataUrlAverageLength,
      coverDataUrlMaxLength: sqlite.coverDataUrlMaxLength,
      samples: sqlite.samples
    },
    thumbnails: {
      dir: thumbDir,
      exists: dirExists(thumbDir),
      fileCount: thumbFiles.length,
      averageBytes: thumbFiles.length > 0 ? Math.round(thumbBytesTotal / thumbFiles.length) : 0,
      maxBytes: thumbFiles.reduce((max, file) => Math.max(max, file.bytes), 0)
    },
    warnings
  }
}

function printReport(report) {
  console.log('ECHO cover cache diagnostics')
  console.log(`userData: ${report.userDataPath}`)
  console.log(`checkedAt: ${report.checkedAt}`)
  console.log('')
  console.log('SQLite metadata cache:')
  for (const file of report.sqlite.files) {
    const active = file.name === report.sqlite.activeName ? ' (active)' : ''
    console.log(`  ${file.name}: ${file.exists ? 'exists' : 'missing'}${active}`)
  }
  console.log(`  tracksTotal: ${report.sqlite.tracksTotal}`)
  console.log(`  metaWithCoverCount: ${report.sqlite.metaWithCoverCount}`)
  console.log(`  metaWithCoverThumbUrlCount: ${report.sqlite.metaWithCoverThumbUrlCount}`)
  console.log(`  metaWithCoverThumbPathCount: ${report.sqlite.metaWithCoverThumbPathCount}`)
  console.log(`  coverThumbPathFileExistsCount: ${report.sqlite.coverThumbPathFileExistsCount}`)
  console.log(`  coverThumbPathFileMissingCount: ${report.sqlite.coverThumbPathFileMissingCount}`)
  console.log(`  coverDataUrlAverageLength: ${report.sqlite.coverDataUrlAverageLength}`)
  console.log(`  coverDataUrlMaxLength: ${report.sqlite.coverDataUrlMaxLength}`)
  console.log('')
  console.log('Thumbnail cache:')
  console.log(`  dir: ${report.thumbnails.dir}`)
  console.log(`  exists: ${report.thumbnails.exists}`)
  console.log(`  thumbFileCount: ${report.thumbnails.fileCount}`)
  console.log(`  thumbFileAverageBytes: ${report.thumbnails.averageBytes}`)
  console.log(`  thumbFileMaxBytes: ${report.thumbnails.maxBytes}`)
  console.log('')
  console.log(`Samples (${report.sqlite.samples.length}):`)
  for (const sample of report.sqlite.samples) {
    console.log(`- ${sample.title || '(untitled)'} / ${sample.artist || '(unknown artist)'} / ${sample.album || '(unknown album)'}`)
    console.log(`  path: ${sample.path}`)
    console.log(`  cover: ${sample.cover.exists ? `yes (${sample.cover.length} chars)` : 'no'}`)
    console.log(`  coverThumbPath: ${sample.coverThumbPath || '(none)'}`)
    console.log(`  thumbFileExists: ${sample.thumbFileExists}`)
    console.log(`  coverKey: ${sample.coverKey || '(none)'}`)
  }
  if (report.warnings.length > 0) {
    console.log('')
    console.log(`Warnings (${report.warnings.length}):`)
    for (const warning of report.warnings) console.log(`  WARNING: ${warning}`)
  }
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  printHelp()
  process.exit(0)
}

const userDataPath = path.resolve(args.userData || getDefaultUserDataPath())
const report = buildReport({ userDataPath })
if (args.json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  printReport(report)
}
