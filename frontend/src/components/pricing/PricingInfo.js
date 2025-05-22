import React, { useState, useEffect } from 'react';
import {
  Card, Row, Col, Statistic, Table, Tabs, Spin, Alert, Button
} from 'antd';
import { ReloadOutlined, DollarOutlined, HddOutlined, CloudOutlined, GlobalOutlined } from '@ant-design/icons';
import * as serverService from '../../api/services/serverService';
import PageHeader from '../common/PageHeader';

const { TabPane } = Tabs;

function PricingInfo({ projectId }) {
  const [pricing, setPricing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (projectId) {
      fetchPricing();
    }
  }, [projectId]);

  const fetchPricing = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await serverService.getPricing(projectId);
      setPricing(response);
    } catch (error) {
      console.error('Error fetching pricing:', error);
      setError('Failed to load pricing information. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Columns for server types pricing
  const serverTypeColumns = [
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      sorter: (a, b) => a.type.localeCompare(b.type)
    },
    {
      title: 'Monthly Price',
      dataIndex: 'monthly',
      key: 'monthly',
      render: price => price ? `€${price}` : 'N/A',
      sorter: (a, b) => a.monthly - b.monthly
    },
    {
      title: 'Hourly Price',
      dataIndex: 'hourly',
      key: 'hourly',
      render: price => price ? `€${price}` : 'N/A',
      sorter: (a, b) => a.hourly - b.hourly
    }
  ];

  // If still loading
  if (loading) {
    return (
      <div>
        <PageHeader
          title="Pricing Information"
          subtitle="View pricing details for Hetzner Cloud resources"
          breadcrumb={[
            { name: 'Dashboard', path: '/' },
            { name: 'Projects', path: '/projects' },
            { name: 'Pricing' }
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
          title="Pricing Information"
          subtitle="View pricing details for Hetzner Cloud resources"
          breadcrumb={[
            { name: 'Dashboard', path: '/' },
            { name: 'Projects', path: '/projects' },
            { name: 'Pricing' }
          ]}
        />
        <Card>
          <Alert
            message="Error"
            description={error}
            type="error"
            action={
              <Button icon={<ReloadOutlined />} onClick={fetchPricing}>
                Retry
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  // Format server types data for table
  const serverTypeData = pricing?.server_types 
    ? Object.entries(pricing.server_types).map(([type, prices]) => ({
        key: type,
        type,
        monthly: prices.monthly,
        hourly: prices.hourly
      }))
    : [];

  // Format load balancer data for table
  const loadBalancerData = pricing?.load_balancers 
    ? Object.entries(pricing.load_balancers).map(([type, prices]) => ({
        key: type,
        type,
        monthly: prices.monthly,
        hourly: prices.hourly
      }))
    : [];

  return (
    <div>
      <PageHeader
        title="Pricing Information"
        subtitle="View pricing details for Hetzner Cloud resources"
        actions={[
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchPricing}
          >
            Refresh
          </Button>
        ]}
        breadcrumb={[
          { name: 'Dashboard', path: '/' },
          { name: 'Projects', path: '/projects' },
          { name: 'Pricing' }
        ]}
      />

      <Row gutter={[16, 16]}>
        <Col span={8}>
          <Card>
            <Statistic
              title="Volume Storage"
              value={pricing?.volumes?.price_per_gb_month || 'N/A'}
              prefix="€"
              suffix="/GB per month"
              precision={2}
              valueStyle={{ color: '#3f8600' }}
              prefix={<HddOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Image Storage"
              value={pricing?.images?.price_per_gb_month || 'N/A'}
              prefix="€"
              suffix="/GB per month"
              precision={2}
              valueStyle={{ color: '#3f8600' }}
              prefix={<CloudOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Floating IP"
              value={pricing?.floating_ips?.price_monthly || 'N/A'}
              prefix="€"
              suffix="/month"
              precision={2}
              valueStyle={{ color: '#3f8600' }}
              prefix={<GlobalOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 16 }}>
        <Tabs defaultActiveKey="server_types">
          <TabPane tab="Server Types" key="server_types">
            <Table 
              dataSource={serverTypeData} 
              columns={serverTypeColumns} 
              pagination={false}
              scroll={{ y: 400 }}
            />
          </TabPane>
          <TabPane tab="Load Balancers" key="load_balancers">
            <Table 
              dataSource={loadBalancerData} 
              columns={serverTypeColumns} 
              pagination={false}
              scroll={{ y: 400 }}
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