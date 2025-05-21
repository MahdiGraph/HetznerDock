import React from 'react';
import { useParams } from 'react-router-dom';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ServerDetailPanel from '../components/servers/ServerDetailPanel';
import PageHeader from '../components/common/PageHeader';

function ServerDetail() {
  const { projectId, serverId } = useParams();
  const navigate = useNavigate();
  
  return (
    <div>
      <PageHeader 
        title="Server Details" 
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
          { name: `Server ${serverId}` }
        ]}
      />
      
      <ServerDetailPanel projectId={projectId} serverId={serverId} />
    </div>
  );
}

export default ServerDetail;