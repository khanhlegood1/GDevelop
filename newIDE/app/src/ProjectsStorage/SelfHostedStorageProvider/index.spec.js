// @flow
import provider from './index';
import { unserializeFromJSObject } from '../../Utils/Serializer';
const gd: libGDevelop = global.gd;
jest.mock('./ProjectPicker', () => () => null);
const originalWindow = global.window;
const originalFetch = global.fetch;
afterEach(() => {
  global.window = originalWindow;
  global.fetch = originalFetch;
});

test('serializes an actual GDevelop project and reopens server resources on a new origin', async () => {
  global.window = { location: { origin: 'http://localhost:8080' } };
  const project = gd.ProjectHelper.createNewGDJSProject();
  const reopened = gd.ProjectHelper.createNewGDJSProject();
  try {
    project.setName('Server game');
    const resource = new gd.ImageResource();
    resource.setName('hero');
    resource.setFile('http://localhost:8080/api/storage/assets/test.png');
    project.getResourcesManager().addResource(resource);
    resource.delete();
    let stored;
    const metadata = {
      fileIdentifier: 'project-id',
      name: 'Server game',
      version: 'v1',
    };
    global.fetch = jest.fn(async (url, options) => {
      if (options && options.method === 'POST') {
        stored = JSON.parse(options.body).content;
        return { ok: true, json: async () => ({ fileMetadata: metadata }) };
      }
      return {
        ok: true,
        json: async () => ({ fileMetadata: metadata, content: stored }),
      };
    });
    const operations = provider.createOperations({
      setDialog: jest.fn(),
      closeDialog: jest.fn(),
      authenticatedUser: {},
    });
    const saved = await operations.onSaveProjectAs(project, null, {
      onStartSaving: jest.fn(),
    });
    expect(saved.wasSaved).toBe(true);
    expect(saved.fileMetadata.gameId).toBe(project.getProjectUuid());
    expect(stored.resources.resources[0].file).toBe(
      '/api/storage/assets/test.png'
    );
    global.window.location.origin = 'https://my-editor.example';
    const legacyMetadata = { ...metadata };
    const result = await operations.onOpen(legacyMetadata);
    expect(legacyMetadata.gameId).toBe(project.getProjectUuid());
    expect(legacyMetadata.version).toBe(metadata.version);
    // Saving must keep the dashboard link even against an older backend which
    // returns no gameId. Do not infer it from the project name or storage ID.
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ fileMetadata: { ...metadata, version: 'v2' } }),
    }));
    const updated = await operations.onSaveProject(project, legacyMetadata);
    expect(updated.fileMetadata.gameId).toBe(project.getProjectUuid());
    expect(updated.fileMetadata.version).toBe('v2');
    unserializeFromJSObject(reopened, result.content);
    expect(reopened.getName()).toBe('Server game');
    expect(
      reopened
        .getResourcesManager()
        .getResource('hero')
        .getFile()
    ).toBe('https://my-editor.example/api/storage/assets/test.png');
  } finally {
    project.delete();
    reopened.delete();
  }
});
