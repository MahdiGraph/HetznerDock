import React from 'react';
import { useParams } from 'react-router-dom';
import NetworksList from '../components/networks/NetworksList';

function Networks() {
  const { projectId } = useParams();
  return <NetworksList projectId={projectId} />;
}

export default Networks;