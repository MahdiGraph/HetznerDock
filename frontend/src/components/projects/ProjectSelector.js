import React from 'react';
import { Select } from 'antd';
import { useNavigate } from 'react-router-dom';

const { Option } = Select;

function ProjectSelector({ projects, currentProject, onChange }) {
  const navigate = useNavigate();
  
  const handleChange = (projectId) => {
    if (projectId === 'add') {
      navigate('/projects');
      return;
    }
    
    const project = projects.find(p => p.id.toString() === projectId);
    if (project) {
      onChange(project);
      navigate(`/projects/${project.id}/servers`);
    }
  };
  
  if (!projects || projects.length === 0) {
    return null;
  }
  
  return (
    <Select
      style={{ width: 200 }}
      value={currentProject ? currentProject.id.toString() : undefined}
      onChange={handleChange}
      placeholder="Select Project"
      dropdownRender={menu => (
        <div>
          {menu}
          <div style={{ borderTop: '1px solid #e8e8e8', padding: '8px', textAlign: 'center' }}>
            <a 
              style={{ display: 'block' }}
              onClick={() => handleChange('add')}
            >
              + Add Project
            </a>
          </div>
        </div>
      )}
    >
      {projects.map(project => (
        <Option key={project.id} value={project.id.toString()}>
          {project.name}
        </Option>
      ))}
    </Select>
  );
}

export default ProjectSelector;