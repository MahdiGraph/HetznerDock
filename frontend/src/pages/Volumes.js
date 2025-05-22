import React from 'react';
import { useParams } from 'react-router-dom';
import VolumesList from '../components/volumes/VolumesList';

function Volumes() {
  const { projectId } = useParams();
  return <VolumesList projectId={projectId} />;
}

export default Volumes;