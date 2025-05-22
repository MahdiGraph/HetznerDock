import React from 'react';
import { useParams } from 'react-router-dom';
import PricingInfo from '../components/pricing/PricingInfo';

function Pricing() {
  const { projectId } = useParams();
  return <PricingInfo projectId={projectId} />;
}

export default Pricing;