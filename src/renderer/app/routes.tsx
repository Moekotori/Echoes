import {
  Captions,
  Cloud,
  Disc3,
  FilePlus2,
  Folder,
  FolderPlus,
  Headphones,
  Heart,
  History,
  Library,
  ListMusic,
  Mic2,
  Music2,
  Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AlbumsPage } from '../pages/AlbumsPage';
import { ArtistsPage } from '../pages/ArtistsPage';
import { FoldersPage } from '../pages/FoldersPage';
import { HistoryPage } from '../pages/HistoryPage';
import { ImportFolderPage } from '../pages/ImportFolderPage';
import { PlaylistsPage } from '../pages/PlaylistsPage';
import { QueuePage } from '../pages/QueuePage';
import { SettingsPage } from '../pages/SettingsPage';
import { SongsPage } from '../pages/SongsPage';
import { EmptyState } from '../components/ui/EmptyState';
import type { TranslationKey } from '../i18n/locales';

export type AppRouteId =
  | 'songs'
  | 'albums'
  | 'artists'
  | 'folders'
  | 'remote'
  | 'queue'
  | 'history'
  | 'playlists'
  | 'liked'
  | 'audio-settings'
  | 'lyrics-settings'
  | 'import-folder'
  | 'import-file'
  | 'settings';

export type AppRoute = {
  id: AppRouteId;
  label: string;
  labelKey?: TranslationKey;
  description: string;
  descriptionKey?: TranslationKey;
  icon: LucideIcon;
  placement: 'main' | 'utility';
  element: JSX.Element;
};

const PlaceholderPage = ({
  icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}): JSX.Element => (
  <div className="page-stack">
    <EmptyState icon={icon} title={title} description={description} meta="This view still uses the shared ECHO Next shell." />
  </div>
);

export const appRoutes: AppRoute[] = [
  {
    id: 'songs',
    label: 'Songs',
    labelKey: 'route.songs.label',
    description: 'Local library song list.',
    descriptionKey: 'route.songs.description',
    icon: Music2,
    placement: 'main',
    element: <SongsPage />,
  },
  {
    id: 'albums',
    label: 'Albums',
    labelKey: 'route.albums.label',
    description: 'Grouped album wall.',
    descriptionKey: 'route.albums.description',
    icon: Disc3,
    placement: 'main',
    element: <AlbumsPage />,
  },
  {
    id: 'artists',
    label: 'Artists',
    labelKey: 'route.artists.label',
    description: 'Browse by artist.',
    descriptionKey: 'route.artists.description',
    icon: Mic2,
    placement: 'main',
    element: <ArtistsPage />,
  },
  {
    id: 'folders',
    label: '文件夹',
    labelKey: 'route.folders.label',
    description: '本地导入根目录。',
    descriptionKey: 'route.folders.description',
    icon: Folder,
    placement: 'main',
    element: <FoldersPage />,
  },
  {
    id: 'remote',
    label: 'Cloud / Remote',
    labelKey: 'route.remote.label',
    description: 'Remote sources.',
    descriptionKey: 'route.remote.description',
    icon: Cloud,
    placement: 'main',
    element: <PlaceholderPage icon={Cloud} title="Cloud / Remote" description="Remote mounting and sync sources stay here." />,
  },
  {
    id: 'queue',
    label: 'Queue',
    labelKey: 'route.queue.label',
    description: 'Playback queue.',
    descriptionKey: 'route.queue.description',
    icon: ListMusic,
    placement: 'main',
    element: <QueuePage />,
  },
  {
    id: 'history',
    label: 'History',
    labelKey: 'route.history.label',
    description: 'Playback history.',
    descriptionKey: 'route.history.description',
    icon: History,
    placement: 'main',
    element: <HistoryPage />,
  },
  {
    id: 'playlists',
    label: 'Playlists',
    labelKey: 'route.playlists.label',
    description: 'User playlists.',
    descriptionKey: 'route.playlists.description',
    icon: Library,
    placement: 'main',
    element: <PlaylistsPage />,
  },
  {
    id: 'liked',
    label: 'Liked',
    labelKey: 'route.liked.label',
    description: 'Saved tracks.',
    descriptionKey: 'route.liked.description',
    icon: Heart,
    placement: 'utility',
    element: <PlaceholderPage icon={Heart} title="Liked" description="Liked tracks will keep a compact list view." />,
  },
  {
    id: 'audio-settings',
    label: 'Audio Settings',
    labelKey: 'route.audioSettings.label',
    description: 'Output and decoder settings.',
    descriptionKey: 'route.audioSettings.description',
    icon: Headphones,
    placement: 'utility',
    element: <PlaceholderPage icon={Headphones} title="Audio Settings" description="Output device, sample rate, and decoder options live here." />,
  },
  {
    id: 'lyrics-settings',
    label: 'Lyrics Settings',
    labelKey: 'route.lyricsSettings.label',
    description: 'Lyrics preferences.',
    descriptionKey: 'route.lyricsSettings.description',
    icon: Captions,
    placement: 'utility',
    element: <PlaceholderPage icon={Captions} title="Lyrics Settings" description="Lyrics sources and timing settings are stored here." />,
  },
  {
    id: 'import-folder',
    label: 'Import Folder',
    labelKey: 'route.importFolder.label',
    description: 'Choose a local music folder.',
    descriptionKey: 'route.importFolder.description',
    icon: FolderPlus,
    placement: 'utility',
    element: <ImportFolderPage />,
  },
  {
    id: 'import-file',
    label: 'Import File',
    labelKey: 'route.importFile.label',
    description: 'Import a single audio file.',
    descriptionKey: 'route.importFile.description',
    icon: FilePlus2,
    placement: 'utility',
    element: <PlaceholderPage icon={FilePlus2} title="Import File" description="Single-file import will reuse the same metadata pipeline." />,
  },
  {
    id: 'settings',
    label: 'Settings',
    labelKey: 'route.settings.label',
    description: 'Application settings.',
    descriptionKey: 'route.settings.description',
    icon: Settings,
    placement: 'utility',
    element: <SettingsPage />,
  },
];
