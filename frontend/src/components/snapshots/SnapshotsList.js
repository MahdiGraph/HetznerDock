import React, { useState, useEffect } from 'react';
import {
  Table, Card, Button, Space, message, Popconfirm, Tag, Modal, Form, Input, Select
} from 'antd';
import {
  ReloadOutlined, DeleteOutlined, PlusCircleOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import * as serverService from '../../api/services/serverService';
import PageHeader from '../common/PageHeader';

const { Option } = Select;

function SnapshotsList({ projectId }) {
  const [snapshots, setSnapshots] = useState([]);
  const [serverTypes, setServerTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createServerModalVisible, setCreateServerModalVisible] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (projectId) {
      fetchData();
    }
  }, [projectId]);
  
  const fetchData = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const [imagesResponse, serverTypesResponse] = await Promise.all([
        serverService.getImages(projectId),
        serverService.getServerTypes(projectId)
      ]);
      
      // Filter images to only include snapshots
      const snapshotsData = (imagesResponse.images || []).filter(
        img => img.type === 'snapshot' || img.type === 'backup'
      );
      
      setSnapshots(snapshotsData);
      setServerTypes(serverTypesResponse.server_types || []);
    } catch (error) {
      message.error('Failed to load snapshots');
    } finally {
      setLoading(false);
    }
  };
  
  const handleDeleteSnapshot = async (snapshotId) => {
    try {
      await serverService.deleteImage(projectId, snapshotId);
      message.success('Snapshot deleted successfully');
      fetchData();
    } catch (error) {
      message.error(`Failed to delete snapshot: ${error.response?.data?.detail || error.message}`);
    }
  };
  
  const handleCreateServer = (snapshot) => {
    setSelectedSnapshot(snapshot);
    setCreateServerModalVisible(true);
  };
  
  const handleCreateServerSubmit = async () => {
    try {
      const values = await form.validateFields();
      await serverService.createServer(projectId, {
        name: values.serverName,
        server_type: values.serverType,
        image: selectedSnapshot.id.toString()
      });
      message.success('Server creation initiated');
      setCreateServerModalVisible(false);
      form.resetFields();
      navigate(`/projects/${projectId}/servers`);
    } catch (error) {
      if (error.errorFields) return;
      message.error(`Failed to create server: ${error.response?.data?.detail || error.message}`);
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
      sorter: (a, b) => (a.name || '').localeCompare(b.name || '')
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description'
    },
    {
      title: 'Created',
      dataIndex: 'created',
      key: 'created',
      render: date => date ? new Date(date).toLocaleString() : 'N/A',
      sorter: (a, b) => new Date(a.created) - new Date(b.created)
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: type => <Tag color={type === 'snapshot' ? 'blue' : 'green'}>{type}</Tag>,
      filters: [
        { text: 'Snapshot', value: 'snapshot' },
        { text: 'Backup', value: 'backup' }
      ],
      onFilter: (value, record) => record.type === value
    },
    {
      title: 'OS',
      dataIndex: 'os_flavor',
      key: 'os_flavor',
      render: os => os ? <Tag>{os}</Tag> : 'N/A'
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button
            icon={<PlusCircleOutlined />}
            onClick={() => handleCreateServer(record)}
          >
            Create Server
          </Button>
          <Popconfirm
            title="Are you sure you want to delete this snapshot?"
            onConfirm={() => handleDeleteSnapshot(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];
  
  return (
    <div>
      <PageHeader
        title="Snapshots & Backups"
        subtitle="Manage your server snapshots and backups"
        actions={[
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchData}
          >
            Refresh
          </Button>
        ]}
        breadcrumb={[
          { name: 'Dashboard', path: '/' },
          { name: 'Projects', path: '/projects' },
          { name: 'Snapshots' }
        ]}
      />
      <Card>
        <Table
          dataSource={snapshots}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
      <Modal
        title="Create Server from Snapshot"
        open={createServerModalVisible}
        onCancel={() => setCreateServerModalVisible(false)}
        onOk={handleCreateServerSubmit}
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="serverName"
            label="Server Name"
            rules={[{ required: true, message: 'Please enter a server name' }]}
          >
            <Input placeholder="Enter server name" />
          </Form.Item>
          <Form.Item
            name="serverType"
            label="Server Type"
            rules={[{ required: true, message: 'Please select a server type' }]}
          >
            <Select placeholder="Select server type">
              {serverTypes.map(type => (
                <Option key={type.name} value={type.name}>
                  {type.name} - {type.description || `${type.cores} CPU, ${type.memory}GB RAM, ${type.disk}GB Disk`}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default SnapshotsList;