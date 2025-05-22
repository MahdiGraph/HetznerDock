import React, { useState, useEffect } from 'react';
import {
  Table, Card, Button, Space, Select, DatePicker, Tag, Tooltip, Badge
} from 'antd';
import { ReloadOutlined, FilterOutlined, InfoCircleOutlined } from '@ant-design/icons';
import * as serverService from '../../api/services/serverService';
import PageHeader from '../common/PageHeader';
import moment from 'moment';

const { RangePicker } = DatePicker;
const { Option } = Select;

function ActionLogs({ projectId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [filters, setFilters] = useState({
    resource_type: undefined,
    status: undefined,
    sort: 'id:desc'
  });

  useEffect(() => {
    if (projectId) {
      fetchLogs();
    }
  }, [projectId, pagination.current, pagination.pageSize, filters]);

  const fetchLogs = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const params = {
        page: pagination.current,
        per_page: pagination.pageSize,
        ...filters
      };

      const response = await serverService.getActions(projectId, params);
      
      setLogs(response.actions || []);
      setPagination({
        ...pagination,
        total: response.meta?.pagination?.total_entries || 0
      });
    } catch (error) {
      console.error('Error fetching action logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTableChange = (newPagination, filters, sorter) => {
    setPagination({
      ...pagination,
      current: newPagination.current,
      pageSize: newPagination.pageSize
    });
  };

  const resetFilters = () => {
    setFilters({
      resource_type: undefined,
      status: undefined,
      sort: 'id:desc'
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success':
        return 'success';
      case 'running':
        return 'processing';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      sorter: true
    },
    {
      title: 'Command',
      dataIndex: 'command',
      key: 'command',
      filters: [
        { text: 'Create Server', value: 'create_server' },
        { text: 'Delete Server', value: 'delete_server' },
        { text: 'Attach Volume', value: 'attach_volume' },
        { text: 'Detach Volume', value: 'detach_volume' }
      ],
      onFilter: (value, record) => record.command === value
    },
    {
      title: 'Resources',
      key: 'resources',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          {record.resources.map((resource, index) => (
            <Tag key={index}>
              {resource.type} {resource.id}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: status => (
        <Badge status={getStatusColor(status)} text={status} />
      ),
      filters: [
        { text: 'Success', value: 'success' },
        { text: 'Running', value: 'running' },
        { text: 'Error', value: 'error' }
      ],
      onFilter: (value, record) => record.status === value
    },
    {
      title: 'Progress',
      dataIndex: 'progress',
      key: 'progress',
      render: progress => `${progress}%`
    },
    {
      title: 'Started',
      dataIndex: 'started',
      key: 'started',
      render: date => date ? moment(date).format('YYYY-MM-DD HH:mm:ss') : 'N/A'
    },
    {
      title: 'Finished',
      dataIndex: 'finished',
      key: 'finished',
      render: date => date ? moment(date).format('YYYY-MM-DD HH:mm:ss') : 'N/A'
    },
    {
      title: 'Error',
      key: 'error',
      render: (_, record) => {
        if (!record.error) return null;
        return (
          <Tooltip title={`${record.error.code}: ${record.error.message}`}>
            <InfoCircleOutlined style={{ color: 'red' }} />
          </Tooltip>
        );
      }
    }
  ];

  return (
    <div>
      <PageHeader
        title="Action Logs"
        subtitle="View API action logs from Hetzner API"
        breadcrumb={[
          { name: 'Dashboard', path: '/' },
          { name: 'Projects', path: '/projects' },
          { name: 'Action Logs' }
        ]}
      />
      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Select
            placeholder="Resource Type"
            style={{ width: 150 }}
            value={filters.resource_type}
            onChange={value => setFilters({ ...filters, resource_type: value })}
            allowClear
          >
            <Option value="server">Server</Option>
            <Option value="volume">Volume</Option>
            <Option value="floating_ip">Floating IP</Option>
            <Option value="network">Network</Option>
            <Option value="firewall">Firewall</Option>
          </Select>
          
          <Select
            placeholder="Status"
            style={{ width: 120 }}
            value={filters.status}
            onChange={value => setFilters({ ...filters, status: value })}
            allowClear
          >
            <Option value="running">Running</Option>
            <Option value="success">Success</Option>
            <Option value="error">Error</Option>
          </Select>
          
          <Select
            placeholder="Sort"
            style={{ width: 120 }}
            value={filters.sort}
            onChange={value => setFilters({ ...filters, sort: value })}
          >
            <Option value="id:desc">Newest First</Option>
            <Option value="id:asc">Oldest First</Option>
          </Select>
          
          <Button 
            icon={<FilterOutlined />} 
            onClick={resetFilters}
          >
            Reset Filters
          </Button>
          
          <Button 
            icon={<ReloadOutlined />} 
            onClick={fetchLogs}
          >
            Refresh
          </Button>
        </Space>
        
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
        />
      </Card>
    </div>
  );
}

export default ActionLogs;