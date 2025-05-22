import React from 'react';
import { useParams } from 'react-router-dom';
import SSHKeysList from '../components/ssh-keys/SSHKeysList';

function SSHKeys() {
  const { projectId } = useParams();
  return <SSHKeysList projectId={projectId} />;
}

export default SSHKeys;