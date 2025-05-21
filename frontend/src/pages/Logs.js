import React, { useState } from 'react';
import { Card, Select } from 'antd';
import { useProjects } from '../context/ProjectContext';
import LogViewer from '../components/logs/LogViewer';
import PageHeader from '../components/common/PageHeader';

const { Option } = Select;

function Logs() {
  const { projects, currentProject } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState(
    currentProject ? currentProject.id : null
  );
  
  const handleProjectChange = (projectId) => {
    setSelectedProjectId(projectId);
  };
  
  return (
    <div>
      <PageHeader 
        title="System Logs" 
        subtitle="View system activity and operation logs"
        breadcrumb={[
          { name: 'Dashboard', path: '/' },
          { name: 'Logs' }
        ]}
      />
      
      {projects.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <span style={{ marginRight: 8 }}>Select Project:</span>
          <Select
            style={{ width: 250 }}
            value={selectedProjectId ? selectedProjectId.toString() : undefined}
            onChange={handleProjectChange}
            placeholder="Select a project to view logs"
          >
            {projects.map(project => (
              <Option key={project.id} value={project.id.toString()}>
                {project.name}
              </Option>
            ))}
          </Select>
        </Card>
      )}
      
      {selectedProjectId ? (
        <LogViewer projectId={selectedProjectId} />
      ) : (
        <Card>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            Please select a project to view logs
          </div>
        </Card>
      )}
    </div>
  );
}

export default Logs;