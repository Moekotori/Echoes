import axios from 'axios'
import { createHash } from 'crypto'

const CLIENT_NAME = 'ECHO'
const CLIENT_VERSION = '1.3.5'
const DEVICE_NAME = 'ECHO Desktop'
const TICKS_PER_SECOND = 10000000

const SERVER_TYPES = new Set(['jellyfin', 'emby'])

function normalizeServerType(value) {
  return value === 'emby' ? 'emby' : 'jellyfin'
}

function normalizeServerUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) {
    throw new Error('Jellyfin / Emby 服务器地址不能为空')
  }
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  const url = new URL(withProtocol)
  url.hash = ''
  url.search = ''
  url.pathname = url.pathname
    .replace(/\/web\/?$/i, '')
    .replace(/\/web\/index\.html$/i, '')
    .replace(/\/+$/, '')
  return url.toString().replace(/\/+$/, '')
}

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function ticksToSeconds(ticks) {
  const value = Number(ticks || 0)
  return Number.isFinite(value) && value > 0 ? Math.round(value / TICKS_PER_SECOND) : 0
}

function pickAudioStream(item) {
  return asArray(item?.MediaStreams).find(stream => stream?.Type === 'Audio') || {}
}

function pickMediaSource(item) {
  return asArray(item?.MediaSources)[0] || {}
}

function cleanCodec(value) {
  return String(value || '').replace(/^\./, '').toUpperCase()
}

function stableDeviceId(serverUrl, username) {
  return createHash('sha1')
    .update(`${CLIENT_NAME}:${serverUrl}:${username}`)
    .digest('hex')
    .slice(0, 32)
}

function buildAuthHeader({ serverType, token = '', userId = '', serverUrl, username }) {
  const scheme = serverType === 'emby' ? 'Emby' : 'MediaBrowser'
  const deviceId = stableDeviceId(serverUrl, username)
  const parts = [
    `Client="${CLIENT_NAME}"`,
    `Device="${DEVICE_NAME}"`,
    `DeviceId="${deviceId}"`,
    `Version="${CLIENT_VERSION}"`
  ]
  if (userId) parts.unshift(`UserId="${userId}"`)
  if (token) parts.push(`Token="${token}"`)
  return `${scheme} ${parts.join(', ')}`
}

export function isJellyfinLikeSourceType(value) {
  return SERVER_TYPES.has(value)
}

export function createJellyfinTrackPath(sourceId, itemId, mediaSourceId = '', type = 'jellyfin') {
  const scheme = normalizeServerType(type)
  const suffix = mediaSourceId ? `/${encodeURIComponent(mediaSourceId)}` : ''
  return `${scheme}://${encodeURIComponent(sourceId)}/audio/${encodeURIComponent(itemId)}${suffix}`
}

export function parseJellyfinTrackPath(value) {
  const raw = String(value || '')
  const match = raw.match(/^(jellyfin|emby):\/\/([^/]+)\/audio\/([^/]+)(?:\/(.+))?$/i)
  if (!match) return null
  return {
    type: normalizeServerType(match[1].toLowerCase()),
    sourceId: decodeURIComponent(match[2]),
    itemId: decodeURIComponent(match[3]),
    mediaSourceId: match[4] ? decodeURIComponent(match[4]) : ''
  }
}

export function isJellyfinTrackPath(value) {
  return Boolean(parseJellyfinTrackPath(value))
}

export function mapJellyfinArtist(item = {}) {
  return {
    id: String(item.Id || ''),
    name: item.Name || 'Unknown Artist',
    albumCount: Number(item.ChildCount || item.AlbumCount || 0),
    coverArt: item.ImageTags?.Primary || ''
  }
}

export function mapJellyfinAlbum(source, item = {}, client = null) {
  const id = String(item.Id || '')
  const title = item.Name || item.Album || 'Unknown Album'
  const artist =
    item.AlbumArtist ||
    asArray(item.AlbumArtists)[0]?.Name ||
    asArray(item.ArtistItems)[0]?.Name ||
    'Unknown Artist'
  return {
    id,
    name: title,
    title,
    artist,
    songCount: Number(item.ChildCount || 0),
    duration: ticksToSeconds(item.RunTimeTicks),
    year: item.ProductionYear ? Number(item.ProductionYear) : undefined,
    cover: client && id ? client.getImageUrl(id, 600) : undefined
  }
}

export function mapJellyfinAudio(source, item = {}, client = null) {
  const sourceType = normalizeServerType(source?.type)
  const sourceId = source?.id || ''
  const itemId = String(item.Id || '')
  const mediaSource = pickMediaSource(item)
  const audioStream = pickAudioStream(item)
  const mediaSourceId = String(mediaSource.Id || itemId)
  const title = item.Name || item.Title || 'Unknown Title'
  const artist =
    asArray(item.Artists)[0] ||
    asArray(item.ArtistItems)[0]?.Name ||
    item.AlbumArtist ||
    'Unknown Artist'
  const album = item.Album || ''
  const container = cleanCodec(item.Container || mediaSource.Container || audioStream.Codec)
  const bitrate = Number(audioStream.BitRate || mediaSource.Bitrate || item.Bitrate || 0)
  const sampleRate = Number(audioStream.SampleRate || 0)
  const bitDepth = Number(audioStream.BitDepth || 0)
  const channels = Number(audioStream.Channels || 0)
  const coverItemId = item.AlbumId || itemId
  const sourceName = source?.name || (sourceType === 'emby' ? 'Emby' : 'Jellyfin')

  return {
    path: createJellyfinTrackPath(sourceId, itemId, mediaSourceId, sourceType),
    name: title,
    title,
    artist,
    album,
    duration: ticksToSeconds(item.RunTimeTicks),
    remote: true,
    remoteType: sourceType,
    remoteSourceId: sourceId,
    remoteSourceName: sourceName,
    remoteSongId: itemId,
    remoteItemId: itemId,
    remoteMediaSourceId: mediaSourceId,
    info: {
      title,
      artist,
      album,
      duration: ticksToSeconds(item.RunTimeTicks),
      codec: container || undefined,
      bitrate: bitrate ? `${Math.round(bitrate / 1000)}kbps` : undefined,
      bitrateKbps: bitrate ? Math.round(bitrate / 1000) : undefined,
      sampleRate: sampleRate ? `${sampleRate}Hz` : undefined,
      sampleRateHz: sampleRate || undefined,
      bitDepth: bitDepth || undefined,
      channels: channels || undefined,
      cover: client && coverItemId ? client.getImageUrl(coverItemId, 600) : undefined,
      source: sourceName,
      remoteType: sourceType
    }
  }
}

export class JellyfinClient {
  constructor({ serverUrl, username, password, type = 'jellyfin', timeout = 12000 }) {
    this.type = normalizeServerType(type)
    this.serverUrl = normalizeServerUrl(serverUrl)
    this.username = String(username || '').trim()
    this.password = String(password || '')
    this.timeout = timeout
    this.accessToken = ''
    this.userId = ''
    this.serverId = ''
    if (!this.username) {
      throw new Error('Jellyfin / Emby 用户名不能为空')
    }
  }

  buildUrl(path, params = {}) {
    const url = new URL(`${this.serverUrl}${path.startsWith('/') ? path : `/${path}`}`)
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
    return url.toString()
  }

  authHeaders() {
    const authorization = buildAuthHeader({
      serverType: this.type,
      token: this.accessToken,
      userId: this.userId,
      serverUrl: this.serverUrl,
      username: this.username
    })
    return {
      'X-Emby-Authorization': authorization,
      ...(this.accessToken ? { 'X-Emby-Token': this.accessToken } : {})
    }
  }

  async authenticate() {
    const result = await axios.post(
      this.buildUrl('/Users/AuthenticateByName'),
      {
        Username: this.username,
        Pw: this.password
      },
      {
        timeout: this.timeout,
        responseType: 'json',
        validateStatus: status => status >= 200 && status < 500,
        headers: {
          ...this.authHeaders(),
          'Content-Type': 'application/json'
        }
      }
    )
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`${this.type === 'emby' ? 'Emby' : 'Jellyfin'} 登录失败 HTTP ${result.status}`)
    }
    const payload = result.data || {}
    const token = payload.AccessToken
    const userId = payload.User?.Id || payload.SessionInfo?.UserId
    if (!token || !userId) {
      throw new Error('服务器未返回可用的访问令牌')
    }
    this.accessToken = String(token)
    this.userId = String(userId)
    this.serverId = payload.ServerId || payload.User?.ServerId || ''
    return true
  }

  async ensureSession() {
    if (this.accessToken && this.userId) return true
    return this.authenticate()
  }

  async request(path, params = {}) {
    await this.ensureSession()
    const result = await axios.get(this.buildUrl(path, params), {
      timeout: this.timeout,
      responseType: 'json',
      validateStatus: status => status >= 200 && status < 500,
      headers: this.authHeaders()
    })
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`${this.type === 'emby' ? 'Emby' : 'Jellyfin'} HTTP ${result.status}`)
    }
    return result.data
  }

  async ping() {
    await this.ensureSession()
    return true
  }

  itemFields() {
    return [
      'AlbumArtist',
      'AudioInfo',
      'ChildCount',
      'Genres',
      'MediaSources',
      'MediaStreams',
      'ParentId',
      'Path',
      'PrimaryImageAspectRatio',
      'ProductionYear',
      'SortName'
    ].join(',')
  }

  async getItems(params = {}) {
    const response = await this.request(`/Users/${this.userId}/Items`, {
      Recursive: true,
      EnableImages: true,
      EnableTotalRecordCount: true,
      Fields: this.itemFields(),
      ...params
    })
    return asArray(response?.Items)
  }

  async getArtists() {
    const items = await this.getItems({
      IncludeItemTypes: 'MusicArtist',
      SortBy: 'SortName',
      SortOrder: 'Ascending',
      Limit: 300
    })
    return items.map(mapJellyfinArtist)
  }

  async getArtist(id) {
    let albums = await this.getItems({
      IncludeItemTypes: 'MusicAlbum',
      AlbumArtistIds: id,
      ArtistIds: id,
      SortBy: 'ProductionYear,SortName',
      SortOrder: 'Descending,Ascending',
      Limit: 300
    })
    if (albums.length === 0) {
      albums = await this.getItems({
        ParentId: id,
        IncludeItemTypes: 'MusicAlbum',
        Recursive: false,
        SortBy: 'ProductionYear,SortName',
        SortOrder: 'Descending,Ascending',
        Limit: 300
      })
    }
    return {
      id: String(id || ''),
      name: albums[0]?.AlbumArtist || albums[0]?.Artist || 'Music Artist',
      albums: albums.map(album => mapJellyfinAlbum(null, album, this))
    }
  }

  async getAlbum(id, source) {
    const albumItem = await this.getItem(id).catch(() => null)
    const songs = await this.getItems({
      ParentId: id,
      IncludeItemTypes: 'Audio',
      Recursive: false,
      SortBy: 'ParentIndexNumber,IndexNumber,SortName',
      SortOrder: 'Ascending',
      Limit: 500
    })
    return {
      ...(albumItem ? mapJellyfinAlbum(source, albumItem, this) : { id, name: 'Album', title: 'Album' }),
      songs: songs.map(song => mapJellyfinAudio(source, song, this))
    }
  }

  async getItem(id) {
    return this.request(`/Users/${this.userId}/Items/${encodeURIComponent(id)}`, {
      Fields: this.itemFields()
    })
  }

  async getAudioItem(id, source) {
    const item = await this.getItem(id)
    return mapJellyfinAudio(source, item, this)
  }

  async search(query, source) {
    const needle = String(query || '').trim()
    const items = await this.getItems({
      SearchTerm: needle,
      IncludeItemTypes: 'MusicArtist,MusicAlbum,Audio',
      SortBy: needle ? 'SortName' : 'DateCreated',
      SortOrder: needle ? 'Ascending' : 'Descending',
      Limit: 160
    })
    return {
      artists: items.filter(item => item.Type === 'MusicArtist').map(mapJellyfinArtist),
      albums: items
        .filter(item => item.Type === 'MusicAlbum')
        .map(album => mapJellyfinAlbum(source, album, this)),
      songs: items
        .filter(item => item.Type === 'Audio')
        .map(song => mapJellyfinAudio(source, song, this))
    }
  }

  async getStarred(source) {
    const items = await this.getItems({
      IsFavorite: true,
      IncludeItemTypes: 'MusicArtist,MusicAlbum,Audio',
      SortBy: 'SortName',
      SortOrder: 'Ascending',
      Limit: 160
    })
    return {
      artists: items.filter(item => item.Type === 'MusicArtist').map(mapJellyfinArtist),
      albums: items
        .filter(item => item.Type === 'MusicAlbum')
        .map(album => mapJellyfinAlbum(source, album, this)),
      songs: items
        .filter(item => item.Type === 'Audio')
        .map(song => mapJellyfinAudio(source, song, this))
    }
  }

  async getRecentlyPlayed(source) {
    const items = await this.getItems({
      IncludeItemTypes: 'Audio',
      SortBy: 'DatePlayed',
      SortOrder: 'Descending',
      Limit: 80
    })
    return {
      artists: [],
      albums: [],
      songs: items.map(song => mapJellyfinAudio(source, song, this))
    }
  }

  async getPlaylists() {
    const items = await this.getItems({
      IncludeItemTypes: 'Playlist',
      MediaTypes: 'Audio',
      SortBy: 'SortName',
      SortOrder: 'Ascending',
      Limit: 200
    })
    return items.map(item => ({
      id: String(item.Id || ''),
      name: item.Name || 'Playlist',
      title: item.Name || 'Playlist',
      songCount: Number(item.ChildCount || 0),
      duration: ticksToSeconds(item.RunTimeTicks),
      owner: '',
      public: false
    }))
  }

  async getPlaylist(id, source) {
    const playlistItem = await this.getItem(id).catch(() => null)
    const songs = await this.getItems({
      ParentId: id,
      IncludeItemTypes: 'Audio',
      Recursive: true,
      SortBy: 'SortName',
      SortOrder: 'Ascending',
      Limit: 500
    })
    return {
      id: String(id || ''),
      name: playlistItem?.Name || 'Playlist',
      title: playlistItem?.Name || 'Playlist',
      artist: source?.name || (this.type === 'emby' ? 'Emby' : 'Jellyfin'),
      songCount: songs.length,
      duration: ticksToSeconds(playlistItem?.RunTimeTicks),
      songs: songs.map(song => mapJellyfinAudio(source, song, this))
    }
  }

  getImageUrl(itemId, width = 600) {
    const params = {
      fillWidth: width,
      quality: 90
    }
    if (this.accessToken) params.api_key = this.accessToken
    return this.buildUrl(`/Items/${encodeURIComponent(itemId)}/Images/Primary`, params)
  }

  async getStreamUrl(itemId, mediaSourceId = '') {
    await this.ensureSession()
    return this.buildUrl(`/Audio/${encodeURIComponent(itemId)}/stream`, {
      static: 'true',
      api_key: this.accessToken,
      MediaSourceId: mediaSourceId || itemId
    })
  }
}
