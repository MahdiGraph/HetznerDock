import React, { useState, useEffect } from 'react';
import { 
  Card, Row, Col, Button, Statistic, Descriptions, Space, 
  Popconfirm, message, Tabs, Divider
} from 'antd';
import { 
  EditOutlined, DeleteOutlined, ReloadOutlined,
  CloudServerOutlined, HddOutlined, DatabaseOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import moment from 'moment';
import { useProjects } from '../context/ProjectContext';
import axios from '../api/axios';
import ProjectForm from '../components/projects/ProjectForm';
import PageHeader from '../components/common/PageHeader';
import Loading from '../components/common/Loading';
import ErrorMessage from '../components/common/ErrorMessage';

const { TabPane } = Tabs;

function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { projects, updateProject, deleteProject } = useProjects();
  
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    servers_count: 0, 
    images_count: 0, 
    server_types_count: 0,
    loading: true
  });
  
  const [formVisible, setFormVisible] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  
  useEffect(() => {
    // Find the project from our projects context
    const foundProject = projects.find(p => p.id.toString() === projectId.toString());
    if (foundProject) {
      setProject(foundProject);
      setLoading(false);
      
      // Load statistics
      fetchStats();
    } else {
      setError("Project not found");
      setLoading(false);
    }
  }, [projectId, projects]);
  
  const fetchStats = async () => {
    try {
      setStats(prev => ({ ...prev, loading: true }));
      
      // Use the new stats endpoint
      const response = await axios.get(`/projects/${projectId}/stats`);
      setStats({
        ...response.data,
        loading: false
      });
    } catch (error) {
      message.error("Failed to load project statistics");
      setStats(prev => ({ ...prev, loading: false }));
    }
  };
  
  const handleEditProject = () => {
    setFormVisible(true);
  };
  
  const handleFormSubmit = async (values) => {
    setFormLoading(true);
    
    try {
      await updateProject(projectId, values);
      setFormVisible(false);
    } finally {
      setFormLoading(false);
    }
  };
  
  const handleDeleteProject = async () => {
    try {
      await deleteProject(projectId);
      navigate('/projects');
      message.success("Project deleted successfully");
    } catch (error) {
      // Error is handled in the context
    }
  };
  
  // Actions for page header
  const actions = [
    <Button 
      icon={<ReloadOutlined />} 
      onClick={fetchStats}
    >
      Refresh
    </Button>,
    <Button 
      icon={<EditOutlined />} 
      onClick={handleEditProject}
    >
      Edit Project
    </Button>,
    <Popconfirm
      title="Are you sure you want to delete this project?"
      description="This action cannot be undone."
      onConfirm={handleDeleteProject}
      okText="Yes, Delete"
      cancelText="Cancel"
      okButtonProps={{ danger: true }}
    >
      <Button danger icon={<DeleteOutlined />}>
        Delete Project
      </Button>
    </Popconfirm>
  ];
  
  if (loading) {
    return <Loading />;
  }
  
  if (error) {
    return <ErrorMessage message={error} />;
  }
  
  if (!project) {
    return <ErrorMessage message="Project not found" />;
  }
  
  return (
    <div>
      <PageHeader 
        title={project.name} 
        subtitle={project.description}
        actions={actions}
        breadcrumb={[
          { name: 'Dashboard', path: '/' },
          { name: 'Projects', path: '/projects' },
          { name: project.name }
        ]}
      />
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card loading={stats.loading}>
            <Statistic
              title="Servers"
              value={stats.servers_count}
              prefix={<CloudServerOutlined />}
              valueStyle={{ cursor: 'pointer' }}
              onClick={() => navigate(`/projects/${projectId}/servers`)}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={8}>
          <Card loading={stats.loading}>
            <Statistic
              title="Available Images"
              value={stats.images_count}
              prefix={<DatabaseOutlined />}
              valueStyle={{ cursor: 'pointer' }}
              onClick={() => navigate(`/projects/${projectId}/images`)}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={8}>
          <Card loading={stats.loading}>
            <Statistic
              title="Server Types"
              value={stats.server_types_count}
              prefix={<SettingOutlined />}
              valueStyle={{ cursor: 'pointer' }}
              onClick={() => navigate(`/projects/${projectId}/server-types`)}
            />
          </Card>
        </Col>
      </Row>
      
      <Card style={{ marginTop: 24 }}>
        <Descriptions 
          title="Project Details" 
          bordered
          column={{ xxl: 3, xl: 2, lg: 2, md: 1, sm: 1, xs: 1 }}
        >
          <Descriptions.Item label="Project ID">{project.id}</Descriptions.Item>
          <Descriptions.Item label="Name">{project.name}</Descriptions.Item>
          <Descriptions.Item label="Description">{project.description || 'No description'}</Descriptions.Item>
          <Descriptions.Item label="Created">
            {project.created_at ? moment(project.created_at).format('YYYY-MM-DD HH:mm:ss') : 'Unknown'}
          </Descriptions.Item>
          <Descriptions.Item label="API Key">
            ••••••••••••••••{project.api_key ? '••••' : '[Not visible]'}
          </Descriptions.Item>
        </Descriptions>
        
        <Divider />
        
        <Tabs defaultActiveKey="servers">
          <TabPane 
            tab={<span><CloudServerOutlined /> Servers</span>}
            key="servers"
          >
            <p>Manage the servers in this project.</p>
            <Space>
              <Button 
                type="primary"
                onClick={() => navigate(`/projects/${projectId}/servers`)}
              >
                View Servers
              </Button>
              <Button 
                onClick={() => navigate(`/projects/${projectId}/create-server`)}
              >
                Create Server
              </Button>
            </Space>
          </TabPane>
          
          <TabPane 
            tab={<span><DatabaseOutlined /> Images</span>}
            key="images"
          >
            <p>View available operating system images for this project.</p>
            <Button 
              onClick={() => navigate(`/projects/${projectId}/images`)}
            >
              View Images
            </Button>
          </TabPane>
          
          <TabPane 
            tab={<span><HddOutlined /> Server Types</span>}
            key="serverTypes"
          >
            <p>View available server types and configurations.</p>
            <Button 
              onClick={() => navigate(`/projects/${projectId}/server-types`)}
            >
              View Server Types
            </Button>
          </TabPane>
        </Tabs>
      </Card>
      
      <ProjectForm
        visible={formVisible}
        initialValues={project}
        onCancel={() => setFormVisible(false)}
        onSubmit={handleFormSubmit}
        confirmLoading={formLoading}
        title={`Edit Project: ${project.name}`}
      />
    </div>
  );
}

export default ProjectDetail;
