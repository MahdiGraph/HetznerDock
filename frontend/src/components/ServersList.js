import React, { useState, useEffect } from 'react';
import { 
  Table, Card, Button, Tag, Space, message, Popconfirm, Tooltip
} from 'antd';
import { 
  PlusOutlined, ReloadOutlined, PoweroffOutlined, 
  PlayCircleOutlined, RedoOutlined, EyeOutlined, DeleteOutlined 
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';

function ServersList({ projectId }) {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  
  useEffect(() => {
    if (projectId) {
      fetchServers();
    }
  }, [projectId]);
  
  const fetchServers = async () => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      const response = await axios.get(`/projects/${projectId}/servers`);
      setServers(response.data.servers || []);
    } catch (error) {
      message.error('Failed to load servers');
    } finally {
      setLoading(false);
    }
  };
  
  const handleServerAction = async (serverId, action, actionName) => {
    try {
      await axios.post(`/projects/${projectId}/servers/${serverId}/${action}`);
      message.success(`Server ${actionName} initiated successfully`);
      // Give a moment for the action to take effect
      setTimeout(fetchServers, 1000);
    } catch (error) {
      message.error(`Failed to ${actionName.toLowerCase()} server: ${error.response?.data?.detail || error.message}`);
    }
  };
  
  const handleDeleteServer = async (serverId) => {
    try {
      await axios.delete(`/projects/${projectId}/servers/${serverId}`);
      message.success('Server deleted successfully');
      fetchServers();
    } catch (error) {
      message.error(`Failed to delete server: ${error.response?.data?.detail || error.message}`);
    }
  };
  
  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id' },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { 
      title: 'Status', 
      dataIndex: 'status', 
      key: 'status',
      render: status => {
        let color = 'default';
        if (status === 'running') color = 'success';
        else if (status === 'off') color = 'error';
        else if (status === 'starting' || status === 'rebuilding') color = 'processing';

        return <Tag color={color}>{status}</Tag>;
      }
    },
    { title: 'IP Address', dataIndex: 'ip', key: 'ip' },
    { title: 'Type', dataIndex: 'server_type', key: 'server_type' },
    { title: 'Location', dataIndex: 'location', key: 'location' },
    { 
      title: 'Actions', 
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="View Details">
            <Button 
              icon={<EyeOutlined />} 
              onClick={() => navigate(`/projects/${projectId}/servers/${record.id}`)}
            />
          </Tooltip>
          
          <Tooltip title="Power On">
            <Button 
              type="primary" 
              icon={<PlayCircleOutlined />} 
              disabled={record.status === 'running'}
              onClick={() => handleServerAction(record.id, 'power_on', 'Power On')}
            />
          </Tooltip>
          
          <Tooltip title="Power Off">
            <Button 
              danger 
              icon={<PoweroffOutlined />} 
              disabled={record.status === 'off'}
              onClick={() => handleServerAction(record.id, 'power_off', 'Power Off')}
            />
          </Tooltip>
          
          <Tooltip title="Reboot">
            <Button 
              icon={<RedoOutlined />} 
              disabled={record.status !== 'running'}
              onClick={() => handleServerAction(record.id, 'reboot', 'Reboot')}
            />
          </Tooltip>
          
          <Tooltip title="Delete">
            <Popconfirm
              title="Are you sure you want to delete this server?"
              onConfirm={() => handleDeleteServer(record.id)}
              okText="Yes"
              cancelText="No"
            >
              <Button danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      )
    }
  ];
  
  return (
    <Card
      title="Servers"
      extra={
        <Space>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={fetchServers}
          >
            Refresh
          </Button>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={() => navigate(`/projects/${projectId}/create-server`)}
          >
            Create Server
          </Button>
        </Space>
      }
    >
      <Table 
        dataSource={servers} 
        columns={columns} 
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
    </Card>
  );
}

export default ServersList;