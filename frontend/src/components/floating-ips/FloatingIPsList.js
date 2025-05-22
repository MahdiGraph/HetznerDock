import React, { useState, useEffect } from 'react';
import {
  Table, Card, Button, Space, message, Popconfirm, Tag, Select
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, LinkOutlined, DisconnectOutlined, DeleteOutlined
} from '@ant-design/icons';
import * as floatingIpService from '../../api/services/floatingIpService';
import * as serverService from '../../api/services/serverService';
import PageHeader from '../common/PageHeader';
import FloatingIPForm from './FloatingIPForm';

function FloatingIPsList({ projectId }) {
  const [floatingIPs, setFloatingIPs] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [assigningIP, setAssigningIP] = useState(null);

  useEffect(() => {
    if (projectId) {
      fetchData();
    }
  }, [projectId]);

  const fetchData = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const [ipsResponse, serversResponse] = await Promise.all([
        floatingIpService.getFloatingIPs(projectId),
        serverService.getServers(projectId)
      ]);
      setFloatingIPs(ipsResponse.floating_ips || []);
      setServers(serversResponse.servers || []);
    } catch (error) {
      message.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateIP = () => {
    setFormVisible(true);
  };

  const handleDeleteIP = async (ipId) => {
    try {
      await floatingIpService.deleteFloatingIP(projectId, ipId);
      message.success('Floating IP deleted successfully');
      fetchData();
    } catch (error) {
      message.error(`Failed to delete Floating IP: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleFormSubmit = async (values) => {
    try {
      await floatingIpService.createFloatingIP(projectId, values);
      message.success('Floating IP created successfully');
      setFormVisible(false);
      fetchData();
    } catch (error) {
      message.error(`Failed to create Floating IP: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleAssignIP = async (ipId, serverId) => {
    try {
      await floatingIpService.assignFloatingIP(projectId, ipId, serverId);
      message.success('Floating IP assigned successfully');
      fetchData();
    } catch (error) {
      message.error(`Failed to assign Floating IP: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleUnassignIP = async (ipId) => {
    try {
      await floatingIpService.unassignFloatingIP(projectId, ipId);
      message.success('Floating IP unassigned successfully');
      fetchData();
    } catch (error) {
      message.error(`Failed to unassign Floating IP: ${error.response?.data?.detail || error.message}`);
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
      title: 'IP Address', 
      dataIndex: 'ip', 
      key: 'ip'
    },
    { 
      title: 'Type', 
      dataIndex: 'type', 
      key: 'type',
      render: type => <Tag color={type === 'ipv4' ? 'blue' : 'purple'}>{type}</Tag>
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
        return <Tag color="red">Not assigned</Tag>;
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          {record.server ? (
            <Button
              icon={<DisconnectOutlined />}
              onClick={() => handleUnassignIP(record.id)}
            >
              Unassign
            </Button>
          ) : (
            <Select 
              placeholder="Assign to server" 
              style={{ width: 200 }}
              onChange={(serverId) => handleAssignIP(record.id, serverId)}
            >
              {servers.map(server => (
                <Select.Option key={server.id} value={server.id}>
                  {server.name}
                </Select.Option>
              ))}
            </Select>
          )}
          <Popconfirm
            title="Are you sure you want to delete this Floating IP?"
            onConfirm={() => handleDeleteIP(record.id)}
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
      onClick={handleCreateIP}
    >
      Create Floating IP
    </Button>
  ];

  return (
    <div>
      <PageHeader
        title="Floating IPs"
        subtitle="Manage your floating IP addresses"
        actions={actions}
        breadcrumb={[
          { name: 'Dashboard', path: '/' },
          { name: 'Projects', path: '/projects' },
          { name: 'Floating IPs' }
        ]}
      />
      <Card>
        <Table
          dataSource={floatingIPs}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <FloatingIPForm
        visible={formVisible}
        onCancel={() => setFormVisible(false)}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}

export default FloatingIPsList;