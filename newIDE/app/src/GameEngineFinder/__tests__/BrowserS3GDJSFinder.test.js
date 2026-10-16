// @flow
import { findGDJS } from '../BrowserS3GDJSFinder';
import Window from '../../Utils/Window';

jest.mock('../../Utils/Window', () => ({ isDev: jest.fn() }));
jest.mock('../../Version', () => ({ getIDEVersionWithHash: () => 'test-version' }));

const originalFlag = process.env.REACT_APP_SELF_HOSTED;
const originalFetch = global.fetch;
const originalWindow = global.window;

afterEach(() => {
  if (originalFlag === undefined) delete process.env.REACT_APP_SELF_HOSTED;
  else process.env.REACT_APP_SELF_HOSTED = originalFlag;
  global.fetch = originalFetch;
  global.window = originalWindow;
  jest.clearAllMocks();
});

const setup = (hostname, isDev) => {
  global.window = { location: { hostname, origin: `https://${hostname}` } };
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve('<html></html>'),
  });
  Window.isDev.mockReturnValue(isDev);
};

test.each(['editor.example.com', 'localhost'])(
  'self-hosted production at %s uses bundled runtime',
  async hostname => {
    process.env.REACT_APP_SELF_HOSTED = 'true';
    setup(hostname, false);
    const result = await findGDJS('preview');
    expect(result.gdjsRoot).toBe(`https://${hostname}/GDJS`);
    expect(global.fetch).toHaveBeenCalledWith(`https://${hostname}/GDJS/Runtime/index.html`);
  }
);

test('upstream production still uses versioned upstream runtime', async () => {
  delete process.env.REACT_APP_SELF_HOSTED;
  setup('editor.example.com', false);
  const result = await findGDJS('preview');
  expect(result.gdjsRoot).toBe('https://resources.gdevelop-app.com/GDJS-test-version');
});

test('ordinary localhost development keeps its runtime watcher', async () => {
  delete process.env.REACT_APP_SELF_HOSTED;
  setup('localhost', true);
  const result = await findGDJS('preview');
  expect(result.gdjsRoot).toBe('http://localhost:5002');
});
