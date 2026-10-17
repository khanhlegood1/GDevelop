// @flow
import * as React from 'react';
import { t, Trans } from '@lingui/macro';
import Computer from '../../UI/CustomSvgIcons/Computer';
import Text from '../../UI/Text';
import { serializeToJSObject } from '../../Utils/Serializer';
import { type StorageProvider } from '..';
import ProjectPicker from './ProjectPicker';
import {
  storageProviderName,
  storageRequest,
  rebaseWorkspaceResources,
} from './Api';

export default ({
  internalName: storageProviderName,
  name: t`This server (private workspace)`,
  renderIcon: props => <Computer fontSize={props.size} />,
  getProjectLocation: ({ projectName }) => ({ name: projectName }),
  renderNewProjectSaveAsLocationChooser: () => (
    <Text>
      <Trans>
        Saved on this server. Everyone with the workspace password can access
        it. Back up the Docker data volume.
      </Trans>
    </Text>
  ),
  createOperations: ({ setDialog, closeDialog }) => ({
    onOpenWithPicker: () =>
      new Promise(resolve => {
        setDialog(() => (
          <ProjectPicker
            onChoose={metadata => {
              closeDialog();
              resolve(metadata);
            }}
            onClose={() => {
              closeDialog();
              resolve(null);
            }}
          />
        ));
      }),
    onOpen: async metadata => {
      const result = await storageRequest(
        '/projects/' + encodeURIComponent(metadata.fileIdentifier)
      );
      // Metadata from recents may be stale. MainFrame keeps the picked metadata;
      // use the latest version for subsequent conflict-checked saves.
      Object.assign(metadata, result.fileMetadata);
      return { content: rebaseWorkspaceResources(result.content, false) };
    },
    onChooseSaveProjectAsLocation: async ({ project }) => ({
      saveAsLocation: { name: project.getName() },
      saveAsOptions: null,
    }),
    onSaveProjectAs: async (project, location, options) => {
      options.onStartSaving();
      const result = await storageRequest('/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: project.getName(),
          content: rebaseWorkspaceResources(serializeToJSObject(project), true),
        }),
      });
      return { wasSaved: true, fileMetadata: result.fileMetadata };
    },
    onSaveProject: async (project, metadata) => {
      const result = await storageRequest(
        '/projects/' + encodeURIComponent(metadata.fileIdentifier),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: project.getName(),
            expectedVersion: metadata.version,
            content: rebaseWorkspaceResources(
              serializeToJSObject(project),
              true
            ),
          }),
        }
      );
      return { wasSaved: true, fileMetadata: result.fileMetadata };
    },
    getWriteErrorMessage: () =>
      t`Could not save to this server. Check the connection, disk quota, or whether another tab changed the project. Keep this tab open and download a copy before reopening.`,
    getOpenErrorMessage: () =>
      t`Could not open the project. Check your workspace login and storage server.`,
  }),
}: StorageProvider);
