import React, { useState, useEffect } from 'react';
import { 
  Table, Card, Button, Tag, Space, message, Popconfirm, Tooltip, Input
} from 'antd';
import { 
  PlusOutlined, ReloadOutlined, PoweroffOutlined, 
  PlayCircleOutlined, RedoOutlined, EyeOutlined, DeleteOutlined,
  SearchOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import * as serverService from '../../api/services/serverService';
import PageHeader from '../common/PageHeader';

function ServersList({ projectId }) {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
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
      const response = await serverService.getServers(projectId);
      setServers(response.servers || []);
    } catch (error) {
      message.error('Failed to load servers');
    } finally {
      setLoading(false);
    }
  };
  
  const handleServerAction = async (serverId, action, actionName) => {
    try {
      let result;
      
      switch (action) {
        case 'power_on':
          result = await serverService.powerOnServer(projectId, serverId);
          break;
        case 'power_off':
          result = await serverService.powerOffServer(projectId, serverId);
          break;
        case 'reboot':
          result = await serverService.rebootServer(projectId, serverId);
          break;
        default:
          return;
      }
      
      message.success(`Server ${actionName} initiated successfully`);
      // Give a moment for the action to take effect
      setTimeout(fetchServers, 1000);
    } catch (error) {
      message.error(`Failed to ${actionName.toLowerCase()} server: ${error.response?.data?.detail || error.message}`);
    }
  };
  
  const handleDeleteServer = async (serverId) => {
    try {
      await serverService.deleteServer(projectId, serverId);
      message.success('Server deleted successfully');
      fetchServers();
    } catch (error) {
      message.error(`Failed to delete server: ${error.response?.data?.detail || error.message}`);
    }
  };
  
  const columns = [
    { 
      title: 'ID', 
      dataIndex: 'id', 
      key: 'id',
      sorter: (a, b) => a.id - b.id
    },
    { 
      title: 'Name', 
      dataIndex: 'name', 
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
        <div style={{ padding: 8 }}>
          <Input
            placeholder="Search server name"
            value={selectedKeys[0]}
            onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={() => confirm()}
            style={{ width: 188, marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button
              type="primary"
              onClick={() => confirm()}
              icon={<SearchOutlined />}
              size="small"
              style={{ width: 90 }}
            >
              Search
            </Button>
            <Button onClick={() => clearFilters()} size="small" style={{ width: 90 }}>
              Reset
            </Button>
          </Space>
        </div>
      ),
      filterIcon: filtered => <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />,
      onFilter: (value, record) => record.name.toLowerCase().includes(value.toLowerCase())
    },
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
      },
      filters: [
        { text: 'Running', value: 'running' },
        { text: 'Off', value: 'off' },
        { text: 'Starting', value: 'starting' },
        { text: 'Rebuilding', value: 'rebuilding' }
      ],
      onFilter: (value, record) => record.status === value
    },
    { title: 'IP Address', dataIndex: 'ip', key: 'ip' },
    { title: 'Type', dataIndex: 'server_type', key: 'server_type' },
    { title: 'Location', dataIndex: 'location', key: 'location' },
    { 
      title: 'Actions', 
      key: 'actions',
      render: (_, record) => (
        <Space size="small" wrap>
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
  
  // Actions for page header
  const actions = [
    <Button 
      icon={<ReloadOutlined />} 
      onClick={fetchServers}
    >
      Refresh
    </Button>,
    <Button 
      type="primary" 
      icon={<PlusOutlined />} 
      onClick={() => navigate(`/projects/${projectId}/create-server`)}
    >
      Create Server
    </Button>
  ];
  
  return (
    <div>
      <PageHeader 
        title="Servers" 
        actions={actions}
        breadcrumb={[
          { name: 'Dashboard', path: '/' },
          { name: 'Projects', path: '/projects' },
          { name: 'Servers' }
        ]}
      />
      
      <Card>
        <Table 
          dataSource={servers} 
          columns={columns} 
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
}

export default ServersList;