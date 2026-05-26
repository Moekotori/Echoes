import type { LibraryAlbum, LibraryTrack } from '../../shared/types/library';

export const albumDetailNavigationEvent = 'app:navigate:album-detail';

export type DetailReturnTarget = 'history' | 'home' | 'songs';

export type AlbumDetailNavigationRequest = {
  album: LibraryAlbum;
  returnTo?: DetailReturnTarget;
};

let pendingAlbumDetail: AlbumDetailNavigationRequest | null = null;

export const requestAlbumDetailNavigation = (album: LibraryAlbum, options: { returnTo?: DetailReturnTarget } = {}): void => {
  const request = { album, returnTo: options.returnTo };
  pendingAlbumDetail = request;
  window.dispatchEvent(new CustomEvent<AlbumDetailNavigationRequest>(albumDetailNavigationEvent, { detail: request }));
};

export const consumePendingAlbumDetailNavigation = (): AlbumDetailNavigationRequest | null => {
  const request = pendingAlbumDetail;
  pendingAlbumDetail = null;
  return request;
};

export const openAlbumDetailForTrack = async (track: LibraryTrack, options: { returnTo?: DetailReturnTarget } = {}): Promise<LibraryAlbum | null> => {
  const library = window.echo?.library;

  if (!library?.getAlbumForTrack) {
    throw new Error('Desktop bridge unavailable. Open ECHO Next in Electron to locate this album.');
  }

  const album = await library.getAlbumForTrack(track.id);

  if (album) {
    requestAlbumDetailNavigation(album, options);
  }

  return album;
};
