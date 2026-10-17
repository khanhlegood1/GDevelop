// @flow
import { getActiveDashboardItems } from './DashboardItems';

const game = { id: 'project-uuid', name: 'Same name', savedStatus: 'draft' };
const file = {
  storageProviderName: 'SelfHosted',
  fileMetadata: {
    fileIdentifier: 'different-storage-id',
    name: 'Same name',
    gameId: game.id,
  },
};

test('server file and registered draft with the same project UUID form one card', () => {
  const result = getActiveDashboardItems([game], [file], game.id);
  expect(result).toEqual([{ game, projectFiles: [file] }]);
});

test('equal names with different project UUIDs must not be merged', () => {
  const other = {
    ...file,
    fileMetadata: { ...file.fileMetadata, gameId: 'other-uuid' },
  };
  expect(getActiveDashboardItems([game], [other], game.id)).toEqual([
    { game, projectFiles: [] },
    { projectFiles: [other] },
  ]);
});

test('two storage copies of the same game remain accessible on one card', () => {
  const copy = {
    ...file,
    fileMetadata: { ...file.fileMetadata, fileIdentifier: 'copy-id' },
  };
  expect(getActiveDashboardItems([game], [file, copy], game.id)).toEqual([
    { game, projectFiles: [file, copy] },
  ]);
});

test('unopened unlinked drafts are hidden and standalone server projects stay visible', () => {
  expect(getActiveDashboardItems([game], [], null)).toEqual([]);
  expect(getActiveDashboardItems([], [file], null)).toEqual([
    { projectFiles: [file] },
  ]);
  expect(getActiveDashboardItems(null, [file], null)).toBe(null);
});
