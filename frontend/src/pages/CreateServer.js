import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import ServerForm from '../components/servers/ServerForm';
import PageHeader from '../components/common/PageHeader';

function CreateServer() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  
  const handleSuccess = (data) => {
    // Navigate to the server list after creation
    navigate(`/projects/${projectId}/servers`);
  };
  
  return (
    <div>
      <PageHeader 
        title="Create New Server" 
        actions={[
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate(`/projects/${projectId}/servers`)}
          >
            Back to Servers
          </Button>
        ]}
        breadcrumb={[
          { name: 'Dashboard', path: '/' },
          { name: 'Projects', path: '/projects' },
          { name: 'Servers', path: `/projects/${projectId}/servers` },
          { name: 'Create Server' }
        ]}
      />
      
      <ServerForm 
        projectId={projectId} 
        onSuccess={handleSuccess}
      />
    </div>
  );
}

export default CreateServer;