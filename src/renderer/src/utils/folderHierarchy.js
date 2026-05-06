function normalizePathSeparators(value) {
  return String(value || '').replace(/\\/g, '/')
}

function trimTrailingSeparators(value) {
  return normalizePathSeparators(value).replace(/\/+$/, '')
}

function getFolderPath(filePath) {
  const normalized = trimTrailingSeparators(filePath)
  if (!normalized) return ''
  const index = normalized.lastIndexOf('/')
  if (index <= 0) return '/'
  return normalized.slice(0, index)
}

function getPathName(filePath) {
  const normalized = trimTrailingSeparators(filePath)
  if (!normalized || normalized === '/') return '/'
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] || normalized
}

function isPathInsideFolder(pathValue, folderValue) {
  const path = trimTrailingSeparators(pathValue).toLowerCase()
  const folder = trimTrailingSeparators(folderValue).toLowerCase()
  if (!path || !folder) return false
  return path === folder || path.startsWith(`${folder}/`)
}

function createFolderNode(folderPath, parentPath = '', depth = 0) {
  return {
    id: folderPath,
    name: getPathName(folderPath),
    folderPath,
    parentPath,
    depth,
    tracks: [],
    children: []
  }
}

function compareFolderNodes(sortMode) {
  return (a, b) => {
    if (sortMode === 'dateAsc' || sortMode === 'dateDesc') {
      const aTime = Math.min(...a.tracks.map((track) => track.birthtimeMs || Infinity))
      const bTime = Math.min(...b.tracks.map((track) => track.birthtimeMs || Infinity))
      const diff = sortMode === 'dateAsc' ? aTime - bTime : bTime - aTime
      if (Number.isFinite(diff) && diff !== 0) return diff
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  }
}

function sortFolderTree(nodes, sortMode) {
  const sorter = compareFolderNodes(sortMode)
  nodes.sort(sorter)
  for (const node of nodes) {
    sortFolderTree(node.children, sortMode)
  }
  return nodes
}

function normalizeImportedRoots(importedFolders = []) {
  const seen = new Set()
  return importedFolders
    .map(trimTrailingSeparators)
    .filter(Boolean)
    .filter((folderPath) => {
      const key = folderPath.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => b.length - a.length)
}

function findImportedRoot(trackPath, importedRoots) {
  return importedRoots.find((folderPath) => isPathInsideFolder(trackPath, folderPath)) || ''
}

function getFallbackRoot(folderPath) {
  const normalized = trimTrailingSeparators(folderPath)
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return normalized || '/'
  if (/^[a-zA-Z]:$/.test(parts[0])) {
    return parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0]
  }
  if (normalized.startsWith('/')) {
    return parts.length > 1 ? `/${parts[0]}/${parts[1]}` : `/${parts[0]}`
  }
  return parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0]
}

export function buildFolderHierarchy(tracks = [], importedFolders = [], sortMode = 'default') {
  const importedRoots = normalizeImportedRoots(importedFolders)
  const nodeMap = new Map()
  const roots = []

  const ensureNode = (folderPath, parentPath = '', depth = 0) => {
    if (nodeMap.has(folderPath)) return nodeMap.get(folderPath)
    const node = createFolderNode(folderPath, parentPath, depth)
    nodeMap.set(folderPath, node)
    if (parentPath && nodeMap.has(parentPath)) {
      nodeMap.get(parentPath).children.push(node)
    } else {
      roots.push(node)
    }
    return node
  }

  for (const track of Array.isArray(tracks) ? tracks : []) {
    const trackPath = normalizePathSeparators(track?.path)
    if (!trackPath) continue
    const parentPath = getFolderPath(trackPath)
    if (!parentPath) continue

    const importedRoot = findImportedRoot(parentPath, importedRoots) || getFallbackRoot(parentPath)

    const rootNode = ensureNode(importedRoot)
    rootNode.tracks.push(track)

    const relativeParent = parentPath.slice(importedRoot.length).replace(/^\/+/, '')
    if (!relativeParent) continue

    let currentPath = importedRoot
    let parent = rootNode
    const segments = relativeParent.split('/').filter(Boolean)
    for (const segment of segments) {
      currentPath = `${currentPath}/${segment}`
      parent = ensureNode(currentPath, parent.folderPath, parent.depth + 1)
      parent.tracks.push(track)
    }
  }

  return sortFolderTree(roots, sortMode)
}

export function flattenFolderHierarchy(nodes = []) {
  const flattened = []
  const visit = (node) => {
    if (!node) return
    flattened.push(node)
    for (const child of node.children || []) visit(child)
  }
  for (const node of nodes) visit(node)
  return flattened
}

export function filterFolderHierarchy(nodes = [], trackPredicate = () => true) {
  return nodes
    .map((node) => {
      const tracks = (node.tracks || []).filter(trackPredicate)
      const children = filterFolderHierarchy(node.children || [], trackPredicate)
      if (tracks.length === 0 && children.length === 0) return null
      return {
        ...node,
        children,
        tracks
      }
    })
    .filter(Boolean)
}
