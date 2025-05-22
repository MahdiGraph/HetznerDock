import React from 'react';
import { useParams } from 'react-router-dom';
import FloatingIPsList from '../components/floating-ips/FloatingIPsList';

function FloatingIPs() {
  const { projectId } = useParams();
  return <FloatingIPsList projectId={projectId} />;
}

export default FloatingIPs;