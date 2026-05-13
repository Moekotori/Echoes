import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { LibraryDiagnostics } from '../../../shared/types/library';
import { getLibraryBridge } from '../../utils/echoBridge';

const formatBytes = (value: number | null): string => {
  if (value === null) {
    return 'n/a';
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

const formatMs = (value: number | null): string => (value === null ? 'n/a' : `${value.toFixed(2)} ms`);

export const LibraryDiagnosticsPanel = (): JSX.Element => {
  const [diagnostics, setDiagnostics] = useState<LibraryDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshDiagnostics = useCallback(async (): Promise<void> => {
    try {
      const library = getLibraryBridge();

      if (!library) {
        setDiagnostics(null);
        setError('Desktop bridge unavailable. Open ECHO Next in Electron to inspect library diagnostics.');
        return;
      }

      setDiagnostics(await library.getDiagnostics());
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    }
  }, []);

  useEffect(() => {
    void refreshDiagnostics();
  }, [refreshDiagnostics]);

  const rows: Array<{ label: string; value: string }> = [
    { label: 'folders count', value: String(diagnostics?.foldersCount ?? 0) },
    { label: 'tracks count', value: String(diagnostics?.tracksCount ?? 0) },
    { label: 'albums count', value: String(diagnostics?.albumsCount ?? 0) },
    { label: 'artists count', value: String(diagnostics?.artistsCount ?? 0) },
    { label: 'covers count', value: String(diagnostics?.coversCount ?? 0) },
    { label: 'last scan status', value: diagnostics?.lastScan?.status ?? 'none' },
    { label: 'last scan discovered count', value: String(diagnostics?.lastScan?.discoveredCount ?? 0) },
    { label: 'parsed count', value: String(diagnostics?.lastScan?.parsedCount ?? 0) },
    { label: 'skipped count', value: String(diagnostics?.lastScan?.skippedCount ?? 0) },
    { label: 'cover count', value: String(diagnostics?.lastScan?.coverCount ?? 0) },
    { label: 'error count', value: String(diagnostics?.lastScan?.errorCount ?? 0) },
    { label: 'getTracks last query time', value: formatMs(diagnostics?.lastQueryMs.getTracks ?? null) },
    { label: 'getAlbums last query time', value: formatMs(diagnostics?.lastQueryMs.getAlbums ?? null) },
    { label: 'average album payload', value: formatBytes(diagnostics?.averageAlbumPayloadBytes ?? null) },
    { label: 'database path', value: diagnostics?.databasePath ?? 'n/a' },
    { label: 'database size', value: formatBytes(diagnostics?.databaseSizeBytes ?? null) },
    { label: 'cover cache path', value: diagnostics?.coverCachePath ?? 'n/a' },
    { label: 'cover cache size', value: formatBytes(diagnostics?.coverCacheSizeBytes ?? null) },
    { label: 'cover cache version', value: String(diagnostics?.coverCacheVersion ?? 0) },
    { label: 'scan CPU count', value: String(diagnostics?.cpuCount ?? 0) },
    { label: 'scan performance mode', value: diagnostics?.scanPerformanceMode ?? 'balanced' },
    { label: 'metadata concurrency', value: String(diagnostics?.metadataConcurrency ?? 0) },
    { label: 'cover concurrency', value: String(diagnostics?.coverConcurrency ?? 0) },
  ];

  return (
    <section className="audio-dev-panel library-diagnostics-panel" aria-label="Library diagnostics">
      <div className="audio-dev-header">
        <div>
          <span className="panel-kicker">Dev only</span>
          <h2>Library Diagnostics</h2>
        </div>
        <button className="tool-button" type="button" aria-label="Refresh diagnostics" title="Refresh diagnostics" onClick={() => void refreshDiagnostics()}>
          <RefreshCw size={17} />
        </button>
      </div>

      <div className="settings-status-grid library-diagnostics-grid">
        {rows.map((row) => (
          <span key={row.label}>
            <em>{row.label}</em>
            <strong>{row.value}</strong>
          </span>
        ))}
      </div>

      {error ? <p className="settings-inline-error">{error}</p> : null}
    </section>
  );
};
