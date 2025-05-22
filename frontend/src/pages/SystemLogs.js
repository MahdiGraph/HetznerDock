import React from 'react';
import { useParams } from 'react-router-dom';
import ActionLogs from '../components/logs/ActionLogs';

function SystemLogs() {
  const { projectId } = useParams();
  return <ActionLogs projectId={projectId} />;
}

export default SystemLogs;