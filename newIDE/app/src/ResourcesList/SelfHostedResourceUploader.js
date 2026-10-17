// @flow
import * as React from 'react';
import { Trans } from '@lingui/macro';
import AlertMessage from '../UI/AlertMessage';
import RaisedButton from '../UI/RaisedButton';
import { ColumnStackLayout } from '../UI/Layout';
import {
  allResourceKindsAndMetadata,
  type ChooseResourceOptions,
} from './ResourceSource';
import { storageRequest } from '../ProjectsStorage/SelfHostedStorageProvider/Api';

const supportedExtensions = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'aac',
  'mp4',
  'webm',
  'ttf',
  'otf',
  'glb',
  'json',
]);

export default function SelfHostedResourceUploader({
  options,
  createNewResource,
  onChooseResources,
}: {|
  options: ChooseResourceOptions,
  createNewResource: () => gdResource,
  onChooseResources: (Array<gdResource>) => void,
|}): React.Node {
  const [files, setFiles] = React.useState<Array<File>>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<?string>(null);
  const metadata = allResourceKindsAndMetadata.find(
    item => item.kind === options.resourceKind
  );
  const extensions = metadata
    ? metadata.fileExtensions.filter(ext =>
        supportedExtensions.has(ext.toLowerCase())
      )
    : [];
  const upload = async () => {
    const created = [];
    try {
      setBusy(true);
      setError(null);
      if (!files.length || files.length > 20)
        throw new Error('Choose between 1 and 20 files.');
      for (const file of files) {
        const extension = file.name
          .split('.')
          .pop()
          .toLowerCase();
        if (!extensions.includes(extension))
          throw new Error(
            'Unsupported file for this resource type: ' + file.name
          );
        if (!file.size || file.size > 32 * 1024 * 1024)
          throw new Error('Each file must be nonempty and at most 32 MiB.');
      }
      for (const file of files) {
        const result = await storageRequest(
          '/assets?filename=' + encodeURIComponent(file.name),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: file,
          }
        );
        const resource = createNewResource();
        created.push(resource);
        resource.setName(file.name);
        resource.setFile(window.location.origin + result.url);
      }
      onChooseResources(created);
    } catch (error) {
      created.forEach(resource => resource.delete());
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ColumnStackLayout>
      <AlertMessage kind="info">
        <Trans>
          Files are uploaded to this private server, not GDevelop Cloud. Save
          the project after adding resources. Multi-file formats and scripts are
          not supported.
        </Trans>
      </AlertMessage>
      {!extensions.length && (
        <AlertMessage kind="warning">
          <Trans>This resource type is not supported by server uploads.</Trans>
        </AlertMessage>
      )}
      <input
        type="file"
        aria-label="Files for this server"
        accept={extensions.map(ext => '.' + ext).join(',')}
        multiple={!!options.multiSelection}
        disabled={busy || !extensions.length}
        onChange={event => {
          setFiles(Array.from(event.currentTarget.files || []));
          setError(null);
        }}
      />
      {error && <AlertMessage kind="error">{error}</AlertMessage>}
      <RaisedButton
        label={
          busy ? (
            <Trans>Uploading...</Trans>
          ) : (
            <Trans>Upload to this server</Trans>
          )
        }
        disabled={busy || !files.length || !extensions.length}
        onClick={upload}
        primary
      />
    </ColumnStackLayout>
  );
}
