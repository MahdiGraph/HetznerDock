export const getStatusColor = (status) => {
  if (!status) return '';
  
  const statusLower = status.toLowerCase();
  
  switch (statusLower) {
    case 'running':
      return 'success';
    case 'off':
      return 'error';
    case 'starting':
    case 'rebuilding':
      return 'processing';
    default:
      return 'default';
  }
};

export const getServerTypes = [
  { id: 'cx11', name: 'CX11', description: '1 vCPU, 2GB RAM, 20GB SSD' },
  { id: 'cx21', name: 'CX21', description: '2 vCPU, 4GB RAM, 40GB SSD' },
  { id: 'cx31', name: 'CX31', description: '2 vCPU, 8GB RAM, 80GB SSD' },
  { id: 'cx41', name: 'CX41', description: '4 vCPU, 16GB RAM, 160GB SSD' },
  { id: 'cx51', name: 'CX51', description: '8 vCPU, 32GB RAM, 240GB SSD' },
  { id: 'cpx11', name: 'CPX11', description: '2 vCPU, 2GB RAM, 40GB SSD' },
  { id: 'cpx21', name: 'CPX21', description: '3 vCPU, 4GB RAM, 80GB SSD' },
  { id: 'cpx31', name: 'CPX31', description: '4 vCPU, 8GB RAM, 160GB SSD' },
  { id: 'cpx41', name: 'CPX41', description: '8 vCPU, 16GB RAM, 240GB SSD' },
  { id: 'cpx51', name: 'CPX51', description: '16 vCPU, 32GB RAM, 360GB SSD' },
];

export const locations = [
  { id: 'nbg1', name: 'Nuremberg', country: 'Germany' },
  { id: 'fsn1', name: 'Falkenstein', country: 'Germany' },
  { id: 'hel1', name: 'Helsinki', country: 'Finland' },
  { id: 'ash', name: 'Ashburn, VA', country: 'USA' },
];