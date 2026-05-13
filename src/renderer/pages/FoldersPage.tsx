import { LibraryFoldersPanel } from '../components/library/LibraryFoldersPanel';

export const FoldersPage = (): JSX.Element => {
  return (
    <div className="page-stack">
      <header className="plain-page-header">
        <h1>文件夹</h1>
        <p>管理本地曲库文件夹和扫描状态</p>
      </header>

      <LibraryFoldersPanel />
    </div>
  );
};
