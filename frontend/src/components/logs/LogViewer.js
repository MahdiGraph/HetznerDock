import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Tag, Space, Tooltip, DatePicker } from 'antd';
import { ReloadOutlined, FilterOutlined } from '@ant-design/icons';
import moment from 'moment';
import * as logService from '../../api/services/logService';

function LogViewer({ projectId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  
  useEffect(() => {
    if (projectId) {
      fetchLogs();
    }
  }, [projectId, pagination.current, pagination.pageSize, dateRange]);
  
  const fetchLogs = async () => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      
      // Build params
      const params = {
        skip: (pagination.current - 1) * pagination.pageSize,
        limit: pagination.pageSize
      };
      
      // Add date filtering if applicable - with proper ISO date format
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.start_date = dateRange[0].format('YYYY-MM-DD');
        params.end_date = dateRange[1].format('YYYY-MM-DD');
      }
      
      const logsData = await logService.getLogs(projectId, params);
      setLogs(logsData || []);
      
      // Update pagination
      setPagination({
        ...pagination,
        total: logsData.length >= pagination.pageSize ? 
          (pagination.current + 1) * pagination.pageSize : 
          (pagination.current * pagination.pageSize - pagination.pageSize) + logsData.length
      });
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleTableChange = (newPagination) => {
    setPagination({
      ...pagination,
      current: newPagination.current,
      pageSize: newPagination.pageSize
    });
  };
  
  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'success':
        return 'success';
      case 'failed':
        return 'error';
      case 'pending':
        return 'processing';
      default:
        return 'default';
    }
  };
  
  const columns = [
    {
      title: 'Time',
      dataIndex: 'created_at',
      key: 'created_at',
      render: date => moment(date).format('YYYY-MM-DD HH:mm:ss'),
      sorter: (a, b) => moment(a.created_at).diff(moment(b.created_at))
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      filters: [
        { text: 'SERVER_CREATE', value: 'SERVER_CREATE' },
        { text: 'SERVER_DELETE', value: 'SERVER_DELETE' },
        { text: 'SERVER_POWER_ON', value: 'SERVER_POWER_ON' },
        { text: 'SERVER_POWER_OFF', value: 'SERVER_POWER_OFF' },
        { text: 'SERVER_REBOOT', value: 'SERVER_REBOOT' },
      ],
      onFilter: (value, record) => record.action === value
    },
    {
      title: 'Details',
      dataIndex: 'details',
      key: 'details',
      ellipsis: {
        showTitle: false,
      },
      render: details => (
        <Tooltip title={details}>
          <span>{details}</span>
        </Tooltip>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: status => (
        <Tag color={getStatusColor(status)}>
          {status}
        </Tag>
      ),
      filters: [
        { text: 'Success', value: 'success' },
        { text: 'Failed', value: 'failed' },
        { text: 'Pending', value: 'pending' },
      ],
      onFilter: (value, record) => record.status === value
    }
  ];
  
  return (
    <Card
      title="System Logs"
      extra={
        <Space>
          <DatePicker.RangePicker 
            allowClear
            onChange={setDateRange}
            style={{ marginRight: 8 }}
          />
          <Button 
            icon={<FilterOutlined />} 
            onClick={() => setDateRange(null)}
            disabled={!dateRange}
          >
            Clear Filters
          </Button>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={fetchLogs}
          >
            Refresh
          </Button>
        </Space>
      }
    >
      <Table 
        dataSource={logs} 
        columns={columns} 
        rowKey="id"
        loading={loading}
        pagination={pagination}
        onChange={handleTableChange}
      />
    </Card>
  );
}

export default LogViewer;
