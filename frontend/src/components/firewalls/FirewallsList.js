import React, { useState, useEffect } from 'react';
import {
  Table, Card, Button, Space, message, Popconfirm, Tag, Collapse, List
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined,
  ArrowRightOutlined, ArrowLeftOutlined
} from '@ant-design/icons';
import * as firewallService from '../../api/services/firewallService';
import PageHeader from '../common/PageHeader';
import FirewallForm from './FirewallForm';

const { Panel } = Collapse;

function FirewallsList({ projectId }) {
  const [firewalls, setFirewalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [editingFirewall, setEditingFirewall] = useState(null);

  useEffect(() => {
    if (projectId) {
      fetchFirewalls();
    }
  }, [projectId]);

  const fetchFirewalls = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const response = await firewallService.getFirewalls(projectId);
      setFirewalls(response.firewalls || []);
    } catch (error) {
      message.error('Failed to load firewalls');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFirewall = () => {
    setEditingFirewall(null);
    setFormVisible(true);
  };

  const handleEditFirewall = (firewall) => {
    setEditingFirewall(firewall);
    setFormVisible(true);
  };

  const handleDeleteFirewall = async (firewallId) => {
    try {
      await firewallService.deleteFirewall(projectId, firewallId);
      message.success('Firewall deleted successfully');
      fetchFirewalls();
    } catch (error) {
      message.error(`Failed to delete firewall: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleFormSubmit = async (values) => {
    try {
      if (editingFirewall) {
        await firewallService.updateFirewall(projectId, editingFirewall.id, values);
        message.success('Firewall updated successfully');
      } else {
        await firewallService.createFirewall(projectId, values);
        message.success('Firewall created successfully');
      }
      setFormVisible(false);
      fetchFirewalls();
    } catch (error) {
      message.error(`Failed to ${editingFirewall ? 'update' : 'create'} firewall: ${error.response?.data?.detail || error.message}`);
    }
  };

  const renderRules = (rules) => {
    if (!rules || rules.length === 0) {
      return <p>No rules defined</p>;
    }

    return (
      <List
        size="small"
        dataSource={rules}
        renderItem={rule => (
          <List.Item>
            <Space>
              <Tag color={rule.direction === 'in' ? 'blue' : 'green'}>
                {rule.direction === 'in' ? <ArrowLeftOutlined /> : <ArrowRightOutlined />}
                {rule.direction.toUpperCase()}
              </Tag>
              <Tag color="purple">{rule.protocol.toUpperCase()}</Tag>
              {rule.port && <Tag>{rule.port}</Tag>}
              {rule.source_ips && rule.source_ips.length > 0 && (
                <span>From: {rule.source_ips.join(', ')}</span>
              )}
              {rule.destination_ips && rule.destination_ips.length > 0 && (
                <span>To: {rule.destination_ips.join(', ')}</span>
              )}
              {rule.description && <span>({rule.description})</span>}
            </Space>
          </List.Item>
        )}
      />
    );
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
      title: 'Rules Count', 
      key: 'rules_count',
      render: (_, record) => record.rules ? record.rules.length : 0
    },
    { 
      title: 'Applied To', 
      key: 'applied_to',
      render: (_, record) => {
        const appliedTo = record.applied_to || [];
        return appliedTo.length > 0 
          ? `${appliedTo.length} server(s)` 
          : <Tag color="red">Not applied</Tag>;
      }
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
            onClick={() => handleEditFirewall(record)}
          />
          <Popconfirm
            title="Are you sure you want to delete this firewall?"
            onConfirm={() => handleDeleteFirewall(record.id)}
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
      onClick={fetchFirewalls}
    >
      Refresh
    </Button>,
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={handleCreateFirewall}
    >
      Create Firewall
    </Button>
  ];

  return (
    <div>
      <PageHeader
        title="Firewalls"
        subtitle="Manage your network firewalls"
        actions={actions}
        breadcrumb={[
          { name: 'Dashboard', path: '/' },
          { name: 'Projects', path: '/projects' },
          { name: 'Firewalls' }
        ]}
      />
      <Card>
        <Table
          dataSource={firewalls}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          expandable={{
            expandedRowRender: record => (
              <Collapse>
                <Panel header="Firewall Rules" key="1">
                  {renderRules(record.rules)}
                </Panel>
                {record.applied_to && record.applied_to.length > 0 && (
                  <Panel header="Applied To" key="2">
                    <List
                      size="small"
                      dataSource={record.applied_to}
                      renderItem={item => (
                        <List.Item>
                          {item.type}: {item.server ? item.server.name || item.server.id : 'Unknown'}
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

      <FirewallForm
        visible={formVisible}
        onCancel={() => setFormVisible(false)}
        onSubmit={handleFormSubmit}
        initialValues={editingFirewall}
      />
    </div>
  );
}

export default FirewallsList;