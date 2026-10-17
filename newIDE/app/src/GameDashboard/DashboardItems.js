// @flow
import { type Game } from '../Utils/GDevelopServices/Game';
import { type FileMetadataAndStorageProviderName } from '../ProjectsStorage';
import { type DashboardItem } from './GameDashboardCard';

// Storage IDs and display names are not game identities. Link files to cloud
// game records by the project UUID carried in fileMetadata.gameId.
export const getActiveDashboardItems = (
  games: ?Array<Game>,
  recentProjectFiles: Array<FileMetadataAndStorageProviderName>,
  currentProjectId: ?string
): ?Array<DashboardItem> => {
  if (!games) return null;
  const projectFilesWithGame = games.map(game => ({
    game,
    projectFiles: recentProjectFiles.filter(
      file => file.fileMetadata.gameId === game.id
    ),
  }));
  const projectFilesWithoutGame = recentProjectFiles
    .filter(file => !games.find(game => game.id === file.fileMetadata.gameId))
    .map(file => ({ projectFiles: [file] }));
  return [...projectFilesWithGame, ...projectFilesWithoutGame].filter(
    item =>
      !(
        item.game &&
        item.game.savedStatus === 'draft' &&
        !item.projectFiles.length &&
        item.game.id !== currentProjectId
      )
  );
};
