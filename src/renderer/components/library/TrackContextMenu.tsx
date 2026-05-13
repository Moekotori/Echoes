import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Copy,
  Disc3,
  Download,
  FileImage,
  FolderOpen,
  ListEnd,
  ListMusic,
  Minus,
  PanelTopOpen,
  Play,
  Plus,
  Tag,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { LibraryTrack } from '../../../shared/types/library';

export type TrackMenuAction =
  | 'add-to-playlist'
  | 'play-next'
  | 'add-to-queue'
  | 'remove-from-queue'
  | 'edit-tags'
  | 'go-to-album'
  | 'show-in-folder'
  | 'copy-path'
  | 'open-system'
  | 'copy-name-artist'
  | 'copy-cover'
  | 'save-cover'
  | 'delete-song';

type TrackContextMenuProps = {
  track: LibraryTrack;
  position: { x: number; y: number };
  onAction: (action: TrackMenuAction, track: LibraryTrack) => void;
  onClose: () => void;
};

type MenuItem = {
  action: TrackMenuAction;
  label: string;
  icon: LucideIcon;
  danger?: boolean;
  disabled?: boolean;
};

const viewportPadding = 8;
const pointerOffset = 6;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));

export const TrackContextMenu = ({ track, position, onAction, onClose }: TrackContextMenuProps): JSX.Element => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState(() => ({
    x: position.x + pointerOffset,
    y: position.y + pointerOffset,
  }));

  useLayoutEffect(() => {
    const menu = menuRef.current;

    if (!menu) {
      return;
    }

    const rect = menu.getBoundingClientRect();
    setMenuPosition({
      x: clamp(position.x + pointerOffset, viewportPadding, window.innerWidth - rect.width - viewportPadding),
      y: clamp(position.y + pointerOffset, viewportPadding, window.innerHeight - rect.height - viewportPadding),
    });
  }, [position.x, position.y]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const items: MenuItem[] = [
    { action: 'add-to-playlist', label: '加入歌单...', icon: Plus },
    { action: 'play-next', label: '下一首播放', icon: Play },
    { action: 'add-to-queue', label: '加入队列', icon: ListEnd },
    { action: 'remove-from-queue', label: '从播放列表移除', icon: Minus },
    { action: 'edit-tags', label: '编辑标签', icon: Tag },
    { action: 'go-to-album', label: '定位到专辑', icon: Disc3 },
    { action: 'show-in-folder', label: '在文件夹中显示', icon: FolderOpen },
    { action: 'copy-path', label: '复制文件路径', icon: Copy },
    { action: 'open-system', label: '使用系统默认应用打开', icon: PanelTopOpen },
    { action: 'copy-name-artist', label: '复制歌名与艺术家', icon: ListMusic },
    { action: 'copy-cover', label: '复制歌曲卡片图片', icon: FileImage },
    { action: 'save-cover', label: '保存歌曲卡片图片', icon: Download },
    { action: 'delete-song', label: '删除歌曲', icon: Trash2, danger: true },
  ];

  return createPortal(
    <div className="track-menu-layer" role="presentation" onMouseDown={onClose}>
      <div
        ref={menuRef}
        className="track-context-menu"
        role="menu"
        style={{ left: menuPosition.x, top: menuPosition.y }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className="track-menu-item"
              data-danger={item.danger ? 'true' : undefined}
              disabled={item.disabled}
              key={item.action}
              role="menuitem"
              type="button"
              onClick={() => onAction(item.action, track)}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
};
