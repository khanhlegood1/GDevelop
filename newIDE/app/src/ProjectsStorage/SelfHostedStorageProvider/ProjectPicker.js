// @flow
import * as React from 'react';
import { Trans } from '@lingui/macro';
import Dialog from '../../UI/Dialog';
import FlatButton from '../../UI/FlatButton';
import RaisedButton from '../../UI/RaisedButton';
import Text from '../../UI/Text';
import AlertMessage from '../../UI/AlertMessage';
import { ColumnStackLayout } from '../../UI/Layout';
import { storageRequest } from './Api';
import { type FileMetadata } from '..';

export default function ProjectPicker({
  onChoose,
  onClose,
}: {|
  onChoose: FileMetadata => void,
  onClose: () => void,
|}): React.Node {
  const [projects, setProjects] = React.useState<?Array<FileMetadata>>(null);
  const [error, setError] = React.useState<?string>(null);
  React.useEffect(() => {
    let active = true;
    storageRequest('/projects').then(
      result => {
        if (active) setProjects(result);
      },
      error => {
        if (active) setError(error.message);
      }
    );
    return () => {
      active = false;
    };
  }, []);
  return (
    <Dialog
      open
      title={<Trans>Projects on this server</Trans>}
      onRequestClose={onClose}
      actions={[
        <FlatButton
          key="cancel"
          label={<Trans>Cancel</Trans>}
          onClick={onClose}
        />,
      ]}
    >
      <ColumnStackLayout>
        <Text>
          <Trans>
            Shared workspace. Projects and uploaded files are stored on the
            server, not in GDevelop Cloud.
          </Trans>
        </Text>
        {error && <AlertMessage kind="error">{error}</AlertMessage>}
        {!projects && !error && (
          <Text>
            <Trans>Loading...</Trans>
          </Text>
        )}
        {projects && !projects.length && (
          <Text>
            <Trans>No saved projects yet.</Trans>
          </Text>
        )}
        {projects &&
          projects.map(project => (
            <RaisedButton
              key={project.fileIdentifier}
              label={project.name || project.fileIdentifier}
              onClick={() => onChoose(project)}
            />
          ))}
      </ColumnStackLayout>
    </Dialog>
  );
}
