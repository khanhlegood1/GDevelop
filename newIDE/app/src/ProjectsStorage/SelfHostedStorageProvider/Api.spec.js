// @flow
import { rebaseWorkspaceResources, storageRequest } from './Api';

const originalWindow = global.window;
const originalFetch = global.fetch;
beforeEach(() => {
  global.window = { location: { origin: 'http://localhost:8080' } };
});
afterEach(() => {
  global.window = originalWindow;
  global.fetch = originalFetch;
});

test('workspace assets survive save/reopen on a different host without changing public URLs', () => {
  const content = {
    resources: {
      resources: [
        { file: 'http://localhost:8080/api/storage/assets/abc.png' },
        { file: 'https://other.example/asset.png' },
      ],
    },
  };
  const stored = rebaseWorkspaceResources(content, true);
  expect(stored.resources.resources[0].file).toBe(
    '/api/storage/assets/abc.png'
  );
  expect(content.resources.resources[0].file).toBe(
    'http://localhost:8080/api/storage/assets/abc.png'
  );
  global.window.location.origin = 'https://games.example';
  const reopened = rebaseWorkspaceResources(stored, false);
  expect(reopened.resources.resources[0].file).toBe(
    'https://games.example/api/storage/assets/abc.png'
  );
  expect(reopened.resources.resources[1].file).toBe(
    'https://other.example/asset.png'
  );
});

test('temporary blob URLs are not silently persisted as durable resources', () => {
  expect(() =>
    rebaseWorkspaceResources(
      { resources: { resources: [{ file: 'blob:temporary' }] } },
      true
    )
  ).toThrow('Temporary blob');
});

test('failed saves surface quota/conflict errors', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Project changed' }),
    });
  await expect(
    storageRequest('/projects/id', { method: 'PUT' })
  ).rejects.toThrow('Project changed');
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/storage/projects/id',
    expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' })
  );
});
