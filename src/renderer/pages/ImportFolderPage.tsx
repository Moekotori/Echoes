import { FolderPlus } from 'lucide-react';
import { LibraryFoldersPanel } from '../components/library/LibraryFoldersPanel';

export const ImportFolderPage = (): JSX.Element => {
  return (
    <div className="page-stack">
      <div className="empty-state import-folder-hero">
        <div className="empty-icon">
          <FolderPlus size={26} />
        </div>
        <div>
          <h2>导入文件夹</h2>
          <p>选择本地音乐文件夹，加入曲库后会立即在后台开始扫描。</p>
          <span>此页面只用于本地曲库导入和扫描状态查看。</span>
        </div>
      </div>

      <LibraryFoldersPanel autoFocus />
    </div>
  );
};
