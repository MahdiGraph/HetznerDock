import React, { useState, useEffect } from 'react';
import {
  Table, Card, Button, Space, message, Popconfirm, Tooltip, Input, Tag
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, CopyOutlined
} from '@ant-design/icons';
import * as sshKeyService from '../../api/services/sshKeyService';
import PageHeader from '../common/PageHeader';
import SSHKeyForm from './SSHKeyForm';

function SSHKeysList({ projectId }) {
  const [sshKeys, setSSHKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [editingKey, setEditingKey] = useState(null);

  useEffect(() => {
    if (projectId) {
      fetchSSHKeys();
    }
  }, [projectId]);

  const fetchSSHKeys = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const response = await sshKeyService.getSSHKeys(projectId);
      setSSHKeys(response.ssh_keys || []);
    } catch (error) {
      message.error('Failed to load SSH keys');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = () => {
    setEditingKey(null);
    setFormVisible(true);
  };

  const handleEditKey = (key) => {
    setEditingKey(key);
    setFormVisible(true);
  };

  const handleDeleteKey = async (keyId) => {
    try {
      await sshKeyService.deleteSSHKey(projectId, keyId);
      message.success('SSH key deleted successfully');
      fetchSSHKeys();
    } catch (error) {
      message.error(`Failed to delete SSH key: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleFormSubmit = async (values) => {
    try {
      if (editingKey) {
        await sshKeyService.updateSSHKey(projectId, editingKey.id, values);
        message.success('SSH key updated successfully');
      } else {
        await sshKeyService.createSSHKey(projectId, values);
        message.success('SSH key created successfully');
      }
      setFormVisible(false);
      fetchSSHKeys();
    } catch (error) {
      message.error(`Failed to ${editingKey ? 'update' : 'create'} SSH key: ${error.response?.data?.detail || error.message}`);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    message.success('Fingerprint copied to clipboard');
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
      title: 'Fingerprint', 
      dataIndex: 'fingerprint', 
      key: 'fingerprint',
      render: fingerprint => (
        <Space>
          <span>{fingerprint.slice(0, 20)}...</span>
          <Button 
            icon={<CopyOutlined />} 
            size="small" 
            onClick={() => copyToClipboard(fingerprint)}
          />
        </Space>
      )
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
            onClick={() => handleEditKey(record)}
          />
          <Popconfirm
            title="Are you sure you want to delete this SSH key?"
            onConfirm={() => handleDeleteKey(record.id)}
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
      onClick={fetchSSHKeys}
    >
      Refresh
    </Button>,
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={handleCreateKey}
    >
      Add SSH Key
    </Button>
  ];

  return (
    <div>
      <PageHeader
        title="SSH Keys"
        subtitle="Manage your SSH keys for server access"
        actions={actions}
        breadcrumb={[
          { name: 'Dashboard', path: '/' },
          { name: 'Projects', path: '/projects' },
          { name: 'SSH Keys' }
        ]}
      />
      <Card>
        <Table
          dataSource={sshKeys}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <SSHKeyForm
        visible={formVisible}
        onCancel={() => setFormVisible(false)}
        onSubmit={handleFormSubmit}
        initialValues={editingKey}
      />
    </div>
  );
}

export default SSHKeysList;