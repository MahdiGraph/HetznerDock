import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Tag, Space, Tooltip, DatePicker } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import moment from 'moment';
import axios from '../api/axios';
import { useParams } from 'react-router-dom';

function LogViewer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const { projectId } = useParams();
  
  useEffect(() => {
    if (projectId) {
      fetchLogs();
    }
  }, [projectId, pagination.current, pagination.pageSize]);
  
  const fetchLogs = async () => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      const skip = (pagination.current - 1) * pagination.pageSize;
      const limit = pagination.pageSize;
      
      const response = await axios.get(`/projects/${projectId}/logs?skip=${skip}&limit=${limit}`);
      setLogs(response.data || []);
      
      // Update pagination
      setPagination({
        ...pagination,
        total: response.data.length >= limit ? pagination.total + 1 : response.data.length + skip
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
    }
  ];
  
  return (
    <Card
      title="System Logs"
      extra={
        <Space>
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