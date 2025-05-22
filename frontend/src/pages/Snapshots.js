import React from 'react';
import { useParams } from 'react-router-dom';
import SnapshotsList from '../components/snapshots/SnapshotsList';

function Snapshots() {
  const { projectId } = useParams();
  return <SnapshotsList projectId={projectId} />;
}

export default Snapshots;