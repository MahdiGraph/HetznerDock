import React, { useState, useEffect } from 'react';
import { 
  Table, Card, message, Input, Button, Tag, Tooltip, Statistic, Row, Col 
} from 'antd';
import { useParams } from 'react-router-dom';
import { ReloadOutlined, SearchOutlined, DollarOutlined } from '@ant-design/icons';
import * as serverService from '../api/services/serverService';
import PageHeader from '../components/common/PageHeader';

function ServerTypes() {
  const { projectId } = useParams();
  const [serverTypes, setServerTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  
  useEffect(() => {
    fetchServerTypes();
  }, [projectId]);
  
  const fetchServerTypes = async () => {
    try {
      setLoading(true);
      const response = await serverService.getServerTypes(projectId);
      setServerTypes(response.server_types || []);
    } catch (error) {
      message.error('Failed to load server types');
    } finally {
      setLoading(false);
    }
  };
  
  const getFilteredServerTypes = () => {
    if (!searchText) {
      return serverTypes;
    }
    
    return serverTypes.filter(type => 
      type.name?.toLowerCase().includes(searchText.toLowerCase()) ||
      type.description?.toLowerCase().includes(searchText.toLowerCase())
    );
  };
  
  const columns = [
    { 
      title: 'Name', 
      dataIndex: 'name', 
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name)
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
      title: 'Cores', 
      dataIndex: 'cores', 
      key: 'cores',
      sorter: (a, b) => a.cores - b.cores
    },
    { 
      title: 'Memory', 
      dataIndex: 'memory', 
      key: 'memory',
      render: memory => `${memory} GB`,
      sorter: (a, b) => a.memory - b.memory
    },
    { 
      title: 'Disk', 
      dataIndex: 'disk', 
      key: 'disk',
      render: disk => `${disk} GB`,
      sorter: (a, b) => a.disk - b.disk
    },
    {
      title: 'Monthly Price',
      key: 'price',
      render: (_, record) => {
        if (!record.prices || record.prices.length === 0) {
          return 'N/A';
        }
        
        // Find price for Nuremberg or first price
        const nuePrice = record.prices.find(p => p.location === 'nbg1');
        const price = nuePrice || record.prices[0];
        
        return (
          <Tooltip title={`Location: ${price.location}`}>
            <Tag color="green">€{price.price_monthly}</Tag>
          </Tooltip>
        );
      }
    }
  ];
  
  return (
    <div>
      <PageHeader 
        title="Server Types" 
        subtitle="Available server configurations for your projects"
        actions={[
          <Button 
            icon={<ReloadOutlined />} 
            onClick={fetchServerTypes}
          >
            Refresh
          </Button>
        ]}
        breadcrumb={[
          { name: 'Dashboard', path: '/' },
          { name: 'Projects', path: '/projects' },
          { name: 'Server Types' }
        ]}
      />
      
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="Standard Servers"
              value={serverTypes.filter(t => t.name.startsWith('cx')).length}
              suffix="types"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Dedicated vCPU"
              value={serverTypes.filter(t => t.name.startsWith('cpx')).length}
              suffix="types"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Server Types"
              value={serverTypes.length}
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
      </Row>
      
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="Search server types..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 300 }}
            allowClear
          />
        </div>
        
        <Table 
          dataSource={getFilteredServerTypes()} 
          columns={columns} 
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
}

export default ServerTypes;