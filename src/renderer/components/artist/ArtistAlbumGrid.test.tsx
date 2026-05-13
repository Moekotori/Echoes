// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LibraryAlbum, LibraryPage } from '../../../shared/types/library';
import { ArtistAlbumGrid } from './ArtistAlbumGrid';

const album = (overrides: Partial<LibraryAlbum> = {}): LibraryAlbum => ({
  id: 'album-1',
  albumKey: 'echo/unit',
  title: 'Refrain',
  albumArtist: 'Archouchou',
  year: 2024,
  trackCount: 18,
  duration: 4200,
  coverId: null,
  coverThumb: null,
  ...overrides,
});

const page = (items: LibraryAlbum[], overrides: Partial<LibraryPage<LibraryAlbum>> = {}): LibraryPage<LibraryAlbum> => ({
  items,
  page: 1,
  pageSize: 12,
  total: items.length,
  hasMore: false,
  ...overrides,
});

const installLibrary = (getArtistAlbums: ReturnType<typeof vi.fn>): void => {
  window.echo = {
    library: {
      getArtistAlbums,
    },
  } as unknown as Window['echo'];
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ArtistAlbumGrid', () => {
  it('selects an artist album by click and keyboard', async () => {
    const selected = vi.fn();
    installLibrary(vi.fn().mockResolvedValue(page([album()])));

    render(<ArtistAlbumGrid artistId="artist-1" artistName="Archouchou" onAlbumSelect={selected} />);

    const card = await screen.findByRole('button', { name: /Refrain/i });
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });

    await waitFor(() => expect(selected).toHaveBeenCalledTimes(3));
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ id: 'album-1', title: 'Refrain' }));
  });
});
