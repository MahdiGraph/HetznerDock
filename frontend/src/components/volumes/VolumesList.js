import React, { useState, useEffect } from 'react';
import {
  Table, Card, Button, Space, message, Popconfirm, Tag, Select, InputNumber, Tooltip, Modal
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, LinkOutlined, DisconnectOutlined, 
  DeleteOutlined, ExpandOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import * as volumeService from '../../api/services/volumeService';
import * as serverService from '../../api/services/serverService';
import PageHeader from '../common/PageHeader';
import VolumeForm from './VolumeForm';

function VolumesList({ projectId }) {
  const [volumes, setVolumes] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [resizingVolume, setResizingVolume] = useState(null);
  const [newSize, setNewSize] = useState(0);

  useEffect(() => {
    if (projectId) {
      fetchData();
    }
  }, [projectId]);

  const fetchData = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const [volumesResponse, serversResponse] = await Promise.all([
        volumeService.getVolumes(projectId),
        serverService.getServers(projectId)
      ]);
      setVolumes(volumesResponse.volumes || []);
      setServers(serversResponse.servers || []);
    } catch (error) {
      message.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVolume = () => {
    setFormVisible(true);
  };

  const handleDeleteVolume = async (volumeId) => {
    try {
      await volumeService.deleteVolume(projectId, volumeId);
      message.success('Volume deleted successfully');
      fetchData();
    } catch (error) {
      message.error(`Failed to delete volume: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleFormSubmit = async (values) => {
    try {
      await volumeService.createVolume(projectId, values);
      message.success('Volume created successfully');
      setFormVisible(false);
      fetchData();
    } catch (error) {
      message.error(`Failed to create volume: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleAttachVolume = async (volumeId, serverId) => {
    try {
      await volumeService.attachVolume(projectId, volumeId, serverId);
      message.success('Volume attached successfully');
      fetchData();
    } catch (error) {
      message.error(`Failed to attach volume: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleDetachVolume = async (volumeId) => {
    try {
      await volumeService.detachVolume(projectId, volumeId);
      message.success('Volume detached successfully');
      fetchData();
    } catch (error) {
      message.error(`Failed to detach volume: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleResizeVolume = async () => {
    if (!resizingVolume || !newSize) return;
    
    try {
      await volumeService.resizeVolume(projectId, resizingVolume.id, newSize);
      message.success(`Volume resized to ${newSize}GB successfully`);
      setResizingVolume(null);
      setNewSize(0);
      fetchData();
    } catch (error) {
      message.error(`Failed to resize volume: ${error.response?.data?.detail || error.message}`);
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
      sorter: (a, b) => a.name.localeCompare(b.name)
    },
    { 
      title: 'Size', 
      dataIndex: 'size', 
      key: 'size',
      render: size => `${size} GB`,
      sorter: (a, b) => a.size - b.size
    },
    { 
      title: 'Location', 
      dataIndex: 'location', 
      key: 'location'
    },
    { 
      title: 'Server', 
      dataIndex: 'server', 
      key: 'server',
      render: (serverId, record) => {
        if (serverId) {
          const server = servers.find(s => s.id === serverId);
          return <Tag color="green">{server ? server.name : `Server #${serverId}`}</Tag>;
        }
        return <Tag color="red">Not attached</Tag>;
      }
    },
    {
      title: 'Linux Device',
      dataIndex: 'linux_device',
      key: 'linux_device',
      render: device => device || 'N/A'
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small" wrap>
          {record.server ? (
            <Button
              icon={<DisconnectOutlined />}
              onClick={() => handleDetachVolume(record.id)}
            >
              Detach
            </Button>
          ) : (
            <Select 
              placeholder="Attach to server" 
              style={{ width: 150 }}
              onChange={(serverId) => handleAttachVolume(record.id, serverId)}
            >
              {servers.map(server => (
                <Select.Option key={server.id} value={server.id}>
                  {server.name}
                </Select.Option>
              ))}
            </Select>
          )}
          
          <Button
            icon={<ExpandOutlined />}
            onClick={() => {
              setResizingVolume(record);
              setNewSize(record.size);
            }}
          >
            Resize
          </Button>
          
          <Popconfirm
            title="Are you sure you want to delete this volume?"
            onConfirm={() => handleDeleteVolume(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  // Actions for page header
  const actions = [
    <Button
      icon={<ReloadOutlined />}
      onClick={fetchData}
    >
      Refresh
    </Button>,
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={handleCreateVolume}
    >
      Create Volume
    </Button>
  ];

  return (
    <div>
      <PageHeader
        title="Volumes"
        subtitle="Manage your block storage volumes"
        actions={actions}
        breadcrumb={[
          { name: 'Dashboard', path: '/' },
          { name: 'Projects', path: '/projects' },
          { name: 'Volumes' }
        ]}
      />
      <Card>
        <Table
          dataSource={volumes}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <VolumeForm
        visible={formVisible}
        onCancel={() => setFormVisible(false)}
        onSubmit={handleFormSubmit}
        servers={servers}
      />

      {/* Resize Volume Modal */}
      <Modal
        title="Resize Volume"
        open={!!resizingVolume}
        onOk={handleResizeVolume}
        onCancel={() => {
          setResizingVolume(null);
          setNewSize(0);
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <strong>Volume:</strong> {resizingVolume?.name}
          </div>
          <div>
            <strong>Current Size:</strong> {resizingVolume?.size} GB
          </div>
          <Space>
            <span><strong>New Size:</strong></span>
            <InputNumber 
              min={resizingVolume?.size || 10}
              value={newSize} 
              onChange={setNewSize} 
              addonAfter="GB" 
            />
          </Space>
          <div>
            <InfoCircleOutlined /> Note: Volumes can only be increased in size, not decreased.
          </div>
        </Space>
      </Modal>
    </div>
  );
}

export default VolumesList;