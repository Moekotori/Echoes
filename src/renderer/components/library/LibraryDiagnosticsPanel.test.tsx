// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { LibraryDiagnosticsPanel } from './LibraryDiagnosticsPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LibraryDiagnosticsPanel', () => {
  it('loads diagnostics without triggering a scan', async () => {
    const scanFolder = vi.fn();
    const getDiagnostics = vi.fn().mockResolvedValue({
      foldersCount: 1,
      tracksCount: 3000,
      albumsCount: 300,
      artistsCount: 42,
      coversCount: 250,
      lastScan: {
        status: 'completed',
        phase: 'finished',
        discoveredCount: 3000,
        parsedCount: 2950,
        skippedCount: 50,
        coverCount: 250,
        errorCount: 0,
        startedAt: null,
        finishedAt: null,
      },
      lastQueryMs: {
        getTracks: 2.1,
        getAlbums: 1.4,
      },
      averageAlbumPayloadBytes: 192,
      databasePath: 'D:\\Echo\\echo-library.sqlite',
      databaseSizeBytes: 1024,
      coverCachePath: 'D:\\Echo\\cover-cache',
      coverCacheSizeBytes: 2048,
      coverCacheVersion: 1,
      cpuCount: 8,
      scanPerformanceMode: 'balanced',
      metadataConcurrency: 4,
      coverConcurrency: 2,
    });

    window.echo = {
      library: {
        getDiagnostics,
        scanFolder,
      },
    } as unknown as Window['echo'];

    render(<LibraryDiagnosticsPanel />);

    await waitFor(() => expect(getDiagnostics).toHaveBeenCalledTimes(1));
    expect(scanFolder).not.toHaveBeenCalled();
    expect(screen.getAllByText('3000')).toHaveLength(2);
    expect(screen.getByText('completed')).toBeTruthy();
    expect(screen.getByText('192 B')).toBeTruthy();
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });
});
