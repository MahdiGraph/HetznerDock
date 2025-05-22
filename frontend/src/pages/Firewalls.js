import React from 'react';
import { useParams } from 'react-router-dom';
import FirewallsList from '../components/firewalls/FirewallsList';

function Firewalls() {
  const { projectId } = useParams();
  return <FirewallsList projectId={projectId} />;
}

export default Firewalls;