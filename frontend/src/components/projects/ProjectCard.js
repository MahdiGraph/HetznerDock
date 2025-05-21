import React from 'react';
import { Card, Space, Button, Popconfirm, Tooltip, Typography } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';

const { Meta } = Card;
const { Text } = Typography;

function ProjectCard({ project, onEdit, onDelete }) {
  const navigate = useNavigate();
  
  return (
    <Card
      className="dashboard-card"
      hoverable
      actions={[
        <Tooltip title="View Project">
          <Button 
            type="text" 
            icon={<EyeOutlined />} 
            onClick={() => navigate(`/projects/${project.id}`)} 
          />
        </Tooltip>,
        <Tooltip title="Edit Project">
          <Button 
            type="text" 
            icon={<EditOutlined />} 
            onClick={() => onEdit(project)} 
          />
        </Tooltip>,
        <Popconfirm
          title="Are you sure you want to delete this project?"
          onConfirm={() => onDelete(project.id)}
          okText="Yes"
          cancelText="No"
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ]}
    >
      <Meta
        title={project.name}
        description={
          <Space direction="vertical" size={0}>
            {project.description && (
              <Text type="secondary">{project.description}</Text>
            )}
            <Text type="secondary">
              Created: {moment(project.created_at).format('YYYY-MM-DD')}
            </Text>
          </Space>
        }
      />
    </Card>
  );
}

export default ProjectCard;