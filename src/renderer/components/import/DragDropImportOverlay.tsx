import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderPlus, Music, Upload } from 'lucide-react';

type DragDropImportOverlayProps = {
  onNotice: (message: string) => void;
};

const getEventFiles = (event: DragEvent): File[] => Array.from(event.dataTransfer?.files ?? []);

const hasFileDrag = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes('Files');

const summarizeDroppedFilesImport = (result: Awaited<ReturnType<NonNullable<Window['echo']>['library']['importDroppedFiles']>>): string => {
  const parts: string[] = [];

  if (result.importedCount > 0) {
    parts.push(`已导入 ${result.importedCount} 首歌曲`);
  }

  if (result.ignoredCount > 0) {
    parts.push(`忽略 ${result.ignoredCount} 个不支持文件`);
  }

  if (result.failedCount > 0) {
    parts.push(`${result.failedCount} 个文件导入失败`);
  }

  return parts.length > 0 ? `${parts.join('，')}。文件已保存到：${result.outputDirectory}` : '未找到可导入的音频文件。';
};

export const DragDropImportOverlay = ({ onNotice }: DragDropImportOverlayProps): JSX.Element | null => {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);

  const resetDragState = useCallback((): void => {
    dragDepthRef.current = 0;
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const handleDragEnter = (event: DragEvent): void => {
      if (!hasFileDrag(event)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDragging(true);
    };

    const handleDragOver = (event: DragEvent): void => {
      if (!hasFileDrag(event)) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      setIsDragging(true);
    };

    const handleDragLeave = (event: DragEvent): void => {
      if (!hasFileDrag(event)) {
        return;
      }

      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDragging(false);
      }
    };

    const handleDrop = (event: DragEvent): void => {
      if (!hasFileDrag(event)) {
        return;
      }

      event.preventDefault();
      const files = getEventFiles(event);
      resetDragState();

      const library = window.echo?.library;
      if (!library) {
        onNotice('桌面桥接不可用。请在 ECHO Next 桌面端导入拖拽文件。');
        return;
      }

      if (files.length === 0) {
        onNotice('未读取到拖拽文件。');
        return;
      }

      void library.importDroppedFiles(files)
        .then((result) => {
          onNotice(summarizeDroppedFilesImport(result));
          if (result.importedCount > 0) {
            window.dispatchEvent(new Event('library:changed'));
          }
        })
        .catch((error) => {
          onNotice(error instanceof Error ? error.message : String(error));
        });
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [onNotice, resetDragState]);

  if (!isDragging) {
    return null;
  }

  return (
    <div className="drag-import-overlay" aria-live="polite">
      <div className="drag-import-panel">
        <div className="drag-import-icons" aria-hidden="true">
          <FolderPlus size={32} />
          <Upload size={38} />
          <Music size={32} />
        </div>
        <strong>拖入音乐文件以导入曲库</strong>
        <span>文件会保存到下载文件夹并加入曲库</span>
      </div>
    </div>
  );
};
