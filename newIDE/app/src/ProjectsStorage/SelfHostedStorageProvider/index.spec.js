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
    expect(stored.resources.resources[0].file).toBe(
      '/api/storage/assets/test.png'
    );
    global.window.location.origin = 'https://my-editor.example';
    const result = await operations.onOpen({ ...metadata });
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
