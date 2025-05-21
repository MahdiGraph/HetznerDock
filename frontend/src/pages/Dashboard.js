import React from 'react';
import { Row, Col, Card, Statistic, Button, Empty } from 'antd';
import { useNavigate } from 'react-router-dom';
import { 
  CloudServerOutlined, CodeOutlined, PlusOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { useProjects } from '../context/ProjectContext';
import PageHeader from '../components/common/PageHeader';

function Dashboard() {
  const { projects, loading, currentProject } = useProjects();
  const navigate = useNavigate();
  
  // Actions for page header
  const actions = [
    <Button 
      type="primary" 
      icon={<PlusOutlined />} 
      onClick={() => navigate('/projects')}
    >
      Add Project
    </Button>
  ];
  
  return (
    <div>
      <PageHeader 
        title="Dashboard" 
        subtitle="HetznerDock management panel overview"
        actions={actions}
      />
      
      {projects.length === 0 ? (
        <Empty 
          image={Empty.PRESENTED_IMAGE_SIMPLE} 
          description={
            <span>
              No projects yet. Let's add your first Hetzner Cloud project.
            </span>
          }
        >
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => navigate('/projects')}
          >
            Add Project
          </Button>
        </Empty>
      ) : (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={8}>
              <Card className="dashboard-card" onClick={() => navigate('/projects')}>
                <Statistic
                  title="Total Projects"
                  value={projects.length}
                  prefix={<CodeOutlined />}
                />
              </Card>
            </Col>
            
            {currentProject && (
              <Col xs={24} sm={12} md={8}>
                <Card 
                  className="dashboard-card" 
                  onClick={() => navigate(`/projects/${currentProject.id}/servers`)}
                >
                  <Statistic
                    title="Current Project"
                    value={currentProject.name}
                    prefix={<CloudServerOutlined />}
                  />
                </Card>
              </Col>
            )}
            
            <Col xs={24} sm={12} md={8}>
              <Card 
                className="dashboard-card"
                onClick={() => navigate('/logs')}
              >
                <Statistic
                  title="System Settings"
                  value="Logs & Configuration"
                  prefix={<SettingOutlined />}
                />
              </Card>
            </Col>
          </Row>
          
          <Card 
            title="Quick Actions" 
            style={{ marginTop: 24 }}
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={8}>
                <Button 
                  block
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/projects')}
                >
                  Manage Projects
                </Button>
              </Col>
              
              {currentProject && (
                <>
                  <Col xs={24} sm={8}>
                    <Button 
                      block
                      type="primary"
                      icon={<CloudServerOutlined />}
                      onClick={() => navigate(`/projects/${currentProject.id}/servers`)}
                    >
                      View Servers
                    </Button>
                  </Col>
                  
                  <Col xs={24} sm={8}>
                    <Button 
                      block
                      icon={<PlusOutlined />}
                      onClick={() => navigate(`/projects/${currentProject.id}/create-server`)}
                    >
                      Create Server
                    </Button>
                  </Col>
                </>
              )}
            </Row>
          </Card>
        </>
      )}
    </div>
  );
}

export default Dashboard;