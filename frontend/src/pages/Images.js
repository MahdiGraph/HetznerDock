import React, { useState, useEffect } from 'react';
import { 
  Table, Card, message, Input, Button, Tag, Tooltip 
} from 'antd';
import { useParams } from 'react-router-dom';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import * as serverService from '../api/services/serverService';
import PageHeader from '../components/common/PageHeader';

function Images() {
  const { projectId } = useParams();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  
  useEffect(() => {
    fetchImages();
  }, [projectId]);
  
  const fetchImages = async () => {
    try {
      setLoading(true);
      const response = await serverService.getImages(projectId);
      setImages(response.images || []);
    } catch (error) {
      message.error('Failed to load images');
    } finally {
      setLoading(false);
    }
  };
  
  const getFilteredImages = () => {
    if (!searchText) {
      return images;
    }
    
    return images.filter(image => 
      image.name?.toLowerCase().includes(searchText.toLowerCase()) ||
      image.description?.toLowerCase().includes(searchText.toLowerCase()) ||
      image.os_flavor?.toLowerCase().includes(searchText.toLowerCase())
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
      sorter: (a, b) => (a.name || '').localeCompare(b.name || '')
    },
    { 
      title: 'Description', 
      dataIndex: 'description', 
      key: 'description',
      render: text => (
        <Tooltip title={text}>
          <span>{text}</span>
        </Tooltip>
      ),
      ellipsis: true
    },
    { 
      title: 'Type', 
      dataIndex: 'type', 
      key: 'type',
      render: type => <Tag>{type}</Tag>,
      filters: [
        { text: 'System', value: 'system' },
        { text: 'Backup', value: 'backup' },
        { text: 'Snapshot', value: 'snapshot' }
      ],
      onFilter: (value, record) => record.type === value
    },
    { 
      title: 'OS', 
      dataIndex: 'os_flavor', 
      key: 'os_flavor',
      filters: [
        { text: 'Ubuntu', value: 'ubuntu' },
        { text: 'Debian', value: 'debian' },
        { text: 'CentOS', value: 'centos' },
        { text: 'Fedora', value: 'fedora' },
        { text: 'Windows', value: 'windows' }
      ],
      onFilter: (value, record) => record.os_flavor === value
    }
  ];
  
  return (
    <div>
      <PageHeader 
        title="Available Images" 
        subtitle="Operating system images available for server creation"
        actions={[
          <Button 
            icon={<ReloadOutlined />} 
            onClick={fetchImages}
          >
            Refresh
          </Button>
        ]}
        breadcrumb={[
          { name: 'Dashboard', path: '/' },
          { name: 'Projects', path: '/projects' },
          { name: 'Images' }
        ]}
      />
      
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="Search images..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 300 }}
            allowClear
          />
        </div>
        
        <Table 
          dataSource={getFilteredImages()} 
          columns={columns} 
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
}

export default Images;