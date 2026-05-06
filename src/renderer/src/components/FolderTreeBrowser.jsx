import React, { useEffect, useMemo, useState } from 'react'
import { ChevronRight, FolderOpen } from 'lucide-react'

function collectAncestorPaths(nodes, targetPath, trail = []) {
  for (const node of nodes || []) {
    if (node.folderPath === targetPath) return trail
    const found = collectAncestorPaths(node.children || [], targetPath, [...trail, node.folderPath])
    if (found) return found
  }
  return null
}

function collectRootPaths(nodes) {
  return (nodes || []).map((node) => node.folderPath).filter(Boolean)
}

export default function FolderTreeBrowser({
  folders = [],
  selectedFolder = 'all',
  onPickFolder,
  onOpenContextMenu
}) {
  const [expandedPaths, setExpandedPaths] = useState(() => new Set())

  const rootPaths = useMemo(() => collectRootPaths(folders), [folders])

  useEffect(() => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      for (const path of rootPaths) next.add(path)
      if (selectedFolder && selectedFolder !== 'all') {
        const ancestors = collectAncestorPaths(folders, selectedFolder) || []
        for (const path of ancestors) next.add(path)
      }
      return next
    })
  }, [folders, rootPaths, selectedFolder])

  const toggleFolder = (event, folderPath) => {
    event.stopPropagation()
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(folderPath)) next.delete(folderPath)
      else next.add(folderPath)
      return next
    })
  }

  const renderNode = (node) => {
    const hasChildren = (node.children || []).length > 0
    const expanded = expandedPaths.has(node.folderPath)
    const active = selectedFolder === node.folderPath
    const count = node.tracks?.length || 0

    return (
      <React.Fragment key={node.folderPath}>
        <div className="folder-tree-row" style={{ '--folder-depth': node.depth || 0 }}>
          <button
            type="button"
            className={`folder-tree-toggle${hasChildren ? '' : ' is-empty'}`}
            onClick={(event) => hasChildren && toggleFolder(event, node.folderPath)}
            aria-label={node.name}
            aria-expanded={hasChildren ? expanded : undefined}
            tabIndex={hasChildren ? 0 : -1}
          >
            {hasChildren && (
              <ChevronRight
                size={13}
                className={`folder-tree-caret${expanded ? ' is-open' : ''}`}
                aria-hidden
              />
            )}
          </button>
          <button
            type="button"
            className={`folder-list-item folder-tree-item${active ? ' active' : ''}`}
            onClick={() => onPickFolder?.(node)}
            onContextMenu={(event) => onOpenContextMenu?.(event, node)}
            title={node.folderPath}
          >
            <FolderOpen size={15} className="folder-list-icon" aria-hidden />
            <span className="folder-list-name">{node.name}</span>
            <span className="folder-list-count">{count}</span>
          </button>
        </div>
        {hasChildren && expanded ? (
          <div className="folder-tree-children">{node.children.map(renderNode)}</div>
        ) : null}
      </React.Fragment>
    )
  }

  return <div className="folder-list folder-tree-list">{folders.map(renderNode)}</div>
}

