import React, { useState, useEffect } from 'react';
import {
  Table, Card, Button, Space, message, Popconfirm, Tag, Collapse, List, Descriptions
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined
} from '@ant-design/icons';
import * as networkService from '../../api/services/networkService';
import PageHeader from '../common/PageHeader';
import NetworkForm from './NetworkForm';

const { Panel } = Collapse;

function NetworksList({ projectId }) {
  const [networks, setNetworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [editingNetwork, setEditingNetwork] = useState(null);

  useEffect(() => {
    if (projectId) {
      fetchNetworks();
    }
  }, [projectId]);

  const fetchNetworks = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const response = await networkService.getNetworks(projectId);
      setNetworks(response.networks || []);
    } catch (error) {
      message.error('Failed to load networks');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNetwork = () => {
    setEditingNetwork(null);
    setFormVisible(true);
  };

  const handleEditNetwork = (network) => {
    setEditingNetwork(network);
    setFormVisible(true);
  };

  const handleDeleteNetwork = async (networkId) => {
    try {
      await networkService.deleteNetwork(projectId, networkId);
      message.success('Network deleted successfully');
      fetchNetworks();
    } catch (error) {
      message.error(`Failed to delete network: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleFormSubmit = async (values) => {
    try {
      if (editingNetwork) {
        await networkService.updateNetwork(projectId, editingNetwork.id, values);
        message.success('Network updated successfully');
      } else {
        await networkService.createNetwork(projectId, values);
        message.success('Network created successfully');
      }
      setFormVisible(false);
      fetchNetworks();
    } catch (error) {
      message.error(`Failed to ${editingNetwork ? 'update' : 'create'} network: ${error.response?.data?.detail || error.message}`);
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
      title: 'IP Range', 
      dataIndex: 'ip_range', 
      key: 'ip_range'
    },
    { 
      title: 'Subnets', 
      key: 'subnets_count',
      render: (_, record) => (record.subnets ? record.subnets.length : 0)
    },
    { 
      title: 'Servers', 
      key: 'servers_count',
      render: (_, record) => (record.servers ? record.servers.length : 0)
    },
    { 
      title: 'Created', 
      dataIndex: 'created', 
      key: 'created',
      render: date => date ? new Date(date).toLocaleString() : 'N/A'
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button
            icon={<EditOutlined />}
            onClick={() => handleEditNetwork(record)}
          />
          <Popconfirm
            title="Are you sure you want to delete this network?"
            onConfirm={() => handleDeleteNetwork(record.id)}
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
      onClick={fetchNetworks}
    >
      Refresh
    </Button>,
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={handleCreateNetwork}
    >
      Create Network
    </Button>
  ];

  return (
    <div>
      <PageHeader
        title="Networks"
        subtitle="Manage your private networks"
        actions={actions}
        breadcrumb={[
          { name: 'Dashboard', path: '/' },
          { name: 'Projects', path: '/projects' },
          { name: 'Networks' }
        ]}
      />
      <Card>
        <Table
          dataSource={networks}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          expandable={{
            expandedRowRender: record => (
              <Collapse>
                <Panel header="Network Details" key="1">
                  <Descriptions bordered column={2} size="small">
                    <Descriptions.Item label="IP Range">{record.ip_range}</Descriptions.Item>
                    <Descriptions.Item label="Created">{record.created ? new Date(record.created).toLocaleString() : 'N/A'}</Descriptions.Item>
                  </Descriptions>
                </Panel>
                
                {record.subnets && record.subnets.length > 0 && (
                  <Panel header="Subnets" key="2">
                    <List
                      size="small"
                      dataSource={record.subnets}
                      renderItem={subnet => (
                        <List.Item>
                          <Space>
                            <Tag color="blue">{subnet.type}</Tag>
                            <span>{subnet.ip_range}</span>
                            <span>Zone: {subnet.network_zone}</span>
                            {subnet.gateway && <span>Gateway: {subnet.gateway}</span>}
                          </Space>
                        </List.Item>
                      )}
                    />
                  </Panel>
                )}
                
                {record.routes && record.routes.length > 0 && (
                  <Panel header="Routes" key="3">
                    <List
                      size="small"
                      dataSource={record.routes}
                      renderItem={route => (
                        <List.Item>
                          Destination: {route.destination} → Gateway: {route.gateway}
                        </List.Item>
                      )}
                    />
                  </Panel>
                )}
                
                {record.servers && record.servers.length > 0 && (
                  <Panel header="Attached Servers" key="4">
                    <List
                      size="small"
                      dataSource={record.servers}
                      renderItem={serverId => (
                        <List.Item>
                          Server ID: {serverId}
                        </List.Item>
                      )}
                    />
                  </Panel>
                )}
              </Collapse>
            ),
          }}
        />
      </Card>

      <NetworkForm
        visible={formVisible}
        onCancel={() => setFormVisible(false)}
        onSubmit={handleFormSubmit}
        initialValues={editingNetwork}
      />
    </div>
  );
}

export default NetworksList;