import React from 'react';
import { useParams } from 'react-router-dom';
import ServersList from '../components/servers/ServersList';

function Servers() {
  const { projectId } = useParams();
  
  return <ServersList projectId={projectId} />;
}

export default Servers;