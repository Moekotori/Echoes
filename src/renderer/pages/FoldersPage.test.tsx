// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('../components/library/LibraryFoldersPanel', () => ({
  LibraryFoldersPanel: () => <div data-testid="library-folders-panel" />,
}));

afterEach(() => {
  cleanup();
});

describe('FoldersPage', () => {
  it('renders LibraryFoldersPanel', async () => {
    const { FoldersPage } = await import('./FoldersPage');

    render(<FoldersPage />);

    expect(screen.getByRole('heading', { name: '文件夹' })).toBeTruthy();
    expect(screen.getByText('管理本地曲库文件夹和扫描状态')).toBeTruthy();
    expect(screen.getByTestId('library-folders-panel')).toBeTruthy();
  });
});
