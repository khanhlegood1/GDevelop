// @flow
export const storageProviderName = 'SelfHosted';
export const storageApi = '/api/storage';

export async function storageRequest(
  endpoint: string,
  options?: Object
): Promise<any> {
  const response = await fetch(storageApi + endpoint, {
    ...options,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      result && result.error
        ? result.error
        : `Workspace request failed (${
            response.status
          }). Check your login and storage server.`
    );
  }
  return result;
}

// Keep stored resource paths independent of hostname/SSH tunnel port, but use
// full URLs in the editor/exporter, which otherwise treats them as local files.
export function rebaseWorkspaceResources(
  content: Object,
  forStorage: boolean
): Object {
  const copy = JSON.parse(JSON.stringify(content));
  const resources = copy.resources && copy.resources.resources;
  if (!Array.isArray(resources)) return copy;
  const prefix = window.location.origin + storageApi + '/assets/';
  for (const resource of resources) {
    if (typeof resource.file !== 'string') continue;
    if (forStorage && resource.file.startsWith('blob:')) {
      throw new Error(
        'Temporary blob resources cannot be saved to this server. Import the original files using Upload to this server first.'
      );
    }
    if (forStorage && resource.file.startsWith(prefix)) {
      resource.file = resource.file.slice(window.location.origin.length);
    } else if (
      !forStorage &&
      resource.file.startsWith(storageApi + '/assets/')
    ) {
      resource.file = window.location.origin + resource.file;
    }
  }
  return copy;
}
