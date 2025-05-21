import React, { useState } from 'react';
import { Row, Col, Button, Empty } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useProjects } from '../context/ProjectContext';
import ProjectCard from '../components/projects/ProjectCard';
import ProjectForm from '../components/projects/ProjectForm';
import PageHeader from '../components/common/PageHeader';
import Loading from '../components/common/Loading';

function Projects() {
  const { projects, loading, addProject, updateProject, deleteProject, fetchProjects } = useProjects();
  const [formVisible, setFormVisible] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  
  const handleAddProject = () => {
    setEditingProject(null);
    setFormVisible(true);
  };
  
  const handleEditProject = (project) => {
    setEditingProject(project);
    setFormVisible(true);
  };
  
  const handleFormSubmit = async (values) => {
    setFormLoading(true);
    
    try {
      if (editingProject) {
        await updateProject(editingProject.id, values);
      } else {
        await addProject(values);
      }
      
      setFormVisible(false);
      fetchProjects();
    } finally {
      setFormLoading(false);
    }
  };
  
  const handleDeleteProject = async (projectId) => {
    try {
      await deleteProject(projectId);
    } catch (error) {
      // Error is handled in the context
    }
  };
  
  // Actions for page header
  const actions = [
    <Button 
      type="primary" 
      icon={<PlusOutlined />} 
      onClick={handleAddProject}
    >
      Add Project
    </Button>
  ];
  
  if (loading) {
    return <Loading />;
  }
  
  return (
    <div>
      <PageHeader 
        title="Projects" 
        subtitle="Manage your Hetzner Cloud projects"
        actions={actions}
        breadcrumb={[
          { name: 'Dashboard', path: '/' },
          { name: 'Projects' }
        ]}
      />
      
      {projects.length === 0 ? (
        <Empty 
          image={Empty.PRESENTED_IMAGE_SIMPLE} 
          description={
            <span>
              No projects yet. Add your first Hetzner Cloud project.
            </span>
          }
        >
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={handleAddProject}
          >
            Add Project
          </Button>
        </Empty>
      ) : (
        <Row gutter={[16, 16]}>
          {projects.map(project => (
            <Col xs={24} sm={12} md={8} lg={6} key={project.id}>
              <ProjectCard 
                project={project} 
                onEdit={() => handleEditProject(project)}
                onDelete={handleDeleteProject}
              />
            </Col>
          ))}
        </Row>
      )}
      
      <ProjectForm
        visible={formVisible}
        initialValues={editingProject}
        onCancel={() => setFormVisible(false)}
        onSubmit={handleFormSubmit}
        confirmLoading={formLoading}
        title={editingProject ? `Edit Project: ${editingProject.name}` : 'Add Project'}
      />
    </div>
  );
}

export default Projects;