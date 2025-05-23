// src/components/pricing/PricingInfo.js
import React, { useState, useEffect } from 'react';
import {
  Card, Row, Col, Statistic, Table, Tabs, Spin, Alert, Button, Input, Tag, Tooltip
} from 'antd';
import {
  ReloadOutlined, DollarOutlined, HddOutlined, CloudOutlined, GlobalOutlined, SearchOutlined
} from '@ant-design/icons';
import * as serverService from '../../api/services/serverService';
import PageHeader from '../common/PageHeader';

const { TabPane } = Tabs;

function PricingInfo({ projectId }) {
  const [pricing, setPricing] = useState(null);
  const [serverTypes, setServerTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    if (projectId) {
      fetchData();
    }
  }, [projectId]);

const fetchData = async () => {
  try {
    setLoading(true);
    setError(null);
    
    // دریافت همزمان داده‌های قیمت و انواع سرور
    const [pricingResponse, serverTypesResponse] = await Promise.all([
      serverService.getPricing(projectId),
      serverService.getServerTypes(projectId)
    ]);
    
    setPricing(pricingResponse);
    
    // پردازش و استانداردسازی داده‌های انواع سرور
    let processedServerTypes = [];
    if (serverTypesResponse && Array.isArray(serverTypesResponse.server_types)) {
      processedServerTypes = serverTypesResponse.server_types.map(serverType => ({
        name: serverType.name || 'Unknown',
        description: serverType.description || `${serverType.cores || 0} vCPU, ${serverType.memory || 0}GB RAM, ${serverType.disk || 0}GB Disk`,
        cores: serverType.cores || 0,
        memory: serverType.memory || 0,
        disk: serverType.disk || 0,
        prices: Array.isArray(serverType.prices) ? serverType.prices : []
      }));
    }
    
    setServerTypes(processedServerTypes);
  } catch (error) {
    console.error('Error fetching data:', error);
    setError('Failed to load pricing and server types information. Please try again.');
  } finally {
    setLoading(false);
  }
};

  // Get price for a server type from pricing data
  const getServerTypePrice = (serverTypeName) => {
    if (!pricing || !pricing.server_types || !pricing.server_types[serverTypeName]) {
      return { monthly: 'N/A', hourly: 'N/A' };
    }
    return pricing.server_types[serverTypeName];
  };

  // Filter server types based on search text
  const getFilteredServerTypes = () => {
    if (!searchText) {
      return serverTypes;
    }

    return serverTypes.filter(type =>
      type.name?.toLowerCase().includes(searchText.toLowerCase()) ||
      type.description?.toLowerCase().includes(searchText.toLowerCase())
    );
  };

  // Columns for server types pricing table
  const serverTypeColumns = [
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
      key: 'monthly_price',
      render: (_, record) => {
        const price = getServerTypePrice(record.name);
        return <Tag color="green">€{price.monthly !== 'N/A' ? price.monthly : '0'}</Tag>;
      },
      sorter: (a, b) => {
        const priceA = getServerTypePrice(a.name);
        const priceB = getServerTypePrice(b.name);
        if (priceA.monthly === 'N/A' || priceB.monthly === 'N/A') return 0;
        return priceA.monthly - priceB.monthly;
      }
    },
    {
      title: 'Hourly Price',
      key: 'hourly_price',
      render: (_, record) => {
        const price = getServerTypePrice(record.name);
        return <Tag color="blue">€{price.hourly !== 'N/A' ? price.hourly : '0'}</Tag>;
      }
    }
  ];

  // If still loading
  if (loading) {
    return (
      <div>
        <PageHeader
          title="Pricing & Server Types"
          subtitle="View pricing details and server configurations for Hetzner Cloud resources"
          breadcrumb={[
            { name: 'Dashboard', path: '/' },
            { name: 'Projects', path: '/projects' },
            { name: 'Pricing & Server Types' }
          ]}
        />
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
            <p style={{ marginTop: 16 }}>Loading pricing data...</p>
          </div>
        </Card>
      </div>
    );
  }

  // If error occurred
  if (error) {
    return (
      <div>
        <PageHeader
          title="Pricing & Server Types"
          subtitle="View pricing details and server configurations for Hetzner Cloud resources"
          breadcrumb={[
            { name: 'Dashboard', path: '/' },
            { name: 'Projects', path: '/projects' },
            { name: 'Pricing & Server Types' }
          ]}
        />
        <Card>
          <Alert
            message="Error"
            description={error}
            type="error"
            action={
              <Button icon={<ReloadOutlined />} onClick={fetchData}>
                Retry
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Pricing & Server Types"
        subtitle="View pricing details and server configurations for Hetzner Cloud resources"
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
          { name: 'Pricing & Server Types' }
        ]}
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="Standard Servers"
              value={serverTypes.filter(t => t.name?.startsWith('cx')).length}
              suffix="types"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Dedicated vCPU"
              value={serverTypes.filter(t => t.name?.startsWith('cpx')).length}
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

      <Card style={{ marginTop: 16 }}>
        <Tabs defaultActiveKey="server_types">
          <TabPane tab="Server Types" key="server_types">
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
              columns={serverTypeColumns}
              rowKey="name"
              loading={loading}
              pagination={{ pageSize: 10 }}
            />
          </TabPane>
          <TabPane tab="Storage & Network" key="storage_network">
            <Card style={{ marginBottom: 16 }}>
              <Statistic
                title="Volume Storage"
                value={pricing?.volumes?.price_per_gb_month || 'N/A'}
                prefix="€"
                suffix="/GB per month"
                precision={4}
              />
              <div style={{ marginTop: 16 }}>
                Volumes provide network storage that can be attached to servers. You are billed for the amount of storage you allocate, regardless of how much of that storage you use.
              </div>
            </Card>

            <Card style={{ marginBottom: 16 }}>
              <Statistic
                title="Image Storage"
                value={pricing?.images?.price_per_gb_month || 'N/A'}
                prefix="€"
                suffix="/GB per month"
                precision={4}
              />
              <div style={{ marginTop: 16 }}>
                Images (Snapshots & Backups) are billed based on the size of the snapshot. Backups are compressed, so usually they are smaller than the volumes they back up.
              </div>
            </Card>

            <Card>
              <Statistic
                title="Floating IP"
                value={pricing?.floating_ips?.price_monthly || 'N/A'}
                prefix="€"
                suffix="/month"
                precision={2}
              />
              <div style={{ marginTop: 16 }}>
                Floating IPs are static IP addresses that can be moved between servers. You are billed for each Floating IP regardless of whether it is currently assigned to a server.
              </div>
            </Card>
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
}

export default PricingInfo;