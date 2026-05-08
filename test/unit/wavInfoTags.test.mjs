import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { readWavInfoTags } from '../../src/main/utils/wavInfoTags.js'

function chunk(id, data) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const header = Buffer.alloc(8)
  header.write(id, 0, 4, 'ascii')
  header.writeUInt32LE(payload.length, 4)
  return payload.length % 2 ? Buffer.concat([header, payload, Buffer.from([0])]) : Buffer.concat([header, payload])
}

function makeInfoWav(tags) {
  const tagChunks = Object.entries(tags).map(([id, value]) => chunk(id, Buffer.from(`${value}\0`, 'utf8')))
  const listPayload = Buffer.concat([Buffer.from('INFO', 'ascii'), ...tagChunks])
  const listChunk = chunk('LIST', listPayload)
  const fmtChunk = chunk(
    'fmt ',
    Buffer.from([1, 0, 2, 0, 0x80, 0xbb, 0, 0, 0, 0xee, 2, 0, 4, 0, 16, 0])
  )
  const dataChunk = chunk('data', Buffer.alloc(4))
  const body = Buffer.concat([fmtChunk, listChunk, dataChunk])
  const header = Buffer.alloc(12)
  header.write('RIFF', 0, 4, 'ascii')
  header.writeUInt32LE(body.length + 4, 4)
  header.write('WAVE', 8, 4, 'ascii')
  return Buffer.concat([header, body])
}

test('readWavInfoTags decodes UTF-8 RIFF INFO tags', () => {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'echo-wav-info-'))
  const filePath = join(dir, '033.林忆莲_李宗盛-当爱已成往事.wav')
  fs.writeFileSync(
    filePath,
    makeInfoWav({
      IART: '林忆莲',
      INAM: '林忆莲_李宗盛-当爱已成往事',
      IPRD: '精选'
    })
  )

  assert.deepEqual(readWavInfoTags(filePath), {
    artist: '林忆莲',
    title: '林忆莲_李宗盛-当爱已成往事',
    album: '精选'
  })
})
