import React, { useState, useEffect } from 'react';
import {
  Descriptions, Button, Card, Space, message, Statistic, Row, Col, Tag, Menu, Dropdown
} from 'antd';
import {
  PoweroffOutlined, PlayCircleOutlined, RedoOutlined,
  LoadingOutlined, ArrowUpOutlined, ClockCircleOutlined,
  HddOutlined, ReloadOutlined, DownOutlined,
  SafetyOutlined, UndoOutlined, SaveOutlined
} from '@ant-design/icons';
import * as serverService from '../../api/services/serverService';
import moment from 'moment';
import RebuildServerModal from './RebuildServerModal';
import RescueModeModal from './RescueModeModal';
import AttachISOModal from './AttachISOModal';

function ServerDetailPanel({ projectId, serverId }) {
  const [server, setServer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // State for advanced actions modals
  const [rebuildModalVisible, setRebuildModalVisible] = useState(false);
  const [rescueModalVisible, setRescueModalVisible] = useState(false);
  const [isoModalVisible, setISOModalVisible] = useState(false);
  const [rootPassword, setRootPassword] = useState(null);

  useEffect(() => {
    fetchServerDetails();
    // Set up polling for status updates
    const intervalId = setInterval(fetchServerDetails, 5000);
    return () => clearInterval(intervalId);
  }, [projectId, serverId]);

  const fetchServerDetails = async () => {
    try {
      setLoading(true);
      const serverData = await serverService.getServer(projectId, serverId);
      setServer(serverData);
    } catch (error) {
      message.error('Failed to load server details');
    } finally {
      setLoading(false);
    }
  };

  const handleServerAction = async (action, actionName) => {
    try {
      setActionLoading(true);
      let result;
      switch (action) {
        case 'power_on':
          result = await serverService.powerOnServer(projectId, serverId);
          break;
        case 'power_off':
          result = await serverService.powerOffServer(projectId, serverId);
          break;
        case 'reboot':
          result = await serverService.rebootServer(projectId, serverId);
          break;
        case 'reset':
          result = await serverService.resetServer(projectId, serverId);
          break;
        default:
          return;
      }
      message.success(`Server ${actionName} initiated successfully`);
      fetchServerDetails();
    } catch (error) {
      message.error(`Failed to ${actionName.toLowerCase()} server: ${error.response?.data?.detail || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRebuildServer = async (image) => {
    try {
      setActionLoading(true);
      const result = await serverService.rebuildServer(projectId, serverId, { image });
      message.success('Server rebuild initiated successfully');
      if (result.root_password) {
        setRootPassword(result.root_password);
      }
      setRebuildModalVisible(false);
      fetchServerDetails();
    } catch (error) {
      message.error(`Failed to rebuild server: ${error.response?.data?.detail || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEnableRescue = async (values) => {
    try {
      setActionLoading(true);
      const result = await serverService.enableRescueMode(projectId, serverId, values);
      message.success('Rescue mode enabled successfully');
      if (result.root_password) {
        setRootPassword(result.root_password);
      }
      setRescueModalVisible(false);
      fetchServerDetails();
    } catch (error) {
      message.error(`Failed to enable rescue mode: ${error.response?.data?.detail || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisableRescue = async () => {
    try {
      setActionLoading(true);
      await serverService.disableRescueMode(projectId, serverId);
      message.success('Rescue mode disabled successfully');
      fetchServerDetails();
    } catch (error) {
      message.error(`Failed to disable rescue mode: ${error.response?.data?.detail || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAttachISO = async (iso) => {
    try {
      setActionLoading(true);
      await serverService.attachISO(projectId, serverId, { iso });
      message.success('ISO attached successfully');
      setISOModalVisible(false);
      fetchServerDetails();
    } catch (error) {
      message.error(`Failed to attach ISO: ${error.response?.data?.detail || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDetachISO = async () => {
    try {
      setActionLoading(true);
      await serverService.detachISO(projectId, serverId);
      message.success('ISO detached successfully');
      fetchServerDetails();
    } catch (error) {
      message.error(`Failed to detach ISO: ${error.response?.data?.detail || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !server) {
    return (
      <Card loading={true}>
        <div style={{ height: 400 }}></div>
      </Card>
    );
  }

  if (!server) {
    return (
      <Card>
        <div>Server not found or access denied.</div>
      </Card>
    );
  }

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'running':
        return 'success';
      case 'off':
        return 'error';
      case 'starting':
      case 'rebuilding':
        return 'processing';
      default:
        return 'default';
    }
  };

  // Status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'running':
        return <ArrowUpOutlined />;
      case 'off':
        return <PoweroffOutlined />;
      case 'starting':
      case 'rebuilding':
        return <LoadingOutlined />;
      default:
        return <ClockCircleOutlined />;
    }
  };

  const actionsMenu = (
    <Menu>
      <Menu.Item key="rebuild" onClick={() => setRebuildModalVisible(true)}>
        <ReloadOutlined /> Rebuild Server
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="rescue_enable" onClick={() => setRescueModalVisible(true)}>
        <SafetyOutlined /> Enable Rescue Mode
      </Menu.Item>
      <Menu.Item key="rescue_disable" onClick={handleDisableRescue}>
        <SafetyOutlined /> Disable Rescue Mode
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="iso_attach" onClick={() => setISOModalVisible(true)}>
        <SaveOutlined /> Attach ISO
      </Menu.Item>
      <Menu.Item key="iso_detach" onClick={handleDetachISO}>
        <SaveOutlined /> Detach ISO
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="reset" onClick={() => handleServerAction('reset', 'Reset')}>
        <UndoOutlined /> Hard Reset
      </Menu.Item>
    </Menu>
  );

  return (
    <div>
      {rootPassword && (
        <Card style={{ marginBottom: 16, borderColor: '#faad14' }}>
          <Space direction="vertical">
            <h3 style={{ color: '#faad14' }}>Root Password</h3>
            <p>This is shown only once. Please save it now.</p>
            <Tag color="orange" style={{ padding: '4px 8px', fontSize: '14px' }}>
              {rootPassword}
            </Tag>
            <Button 
              type="primary" 
              onClick={() => {
                navigator.clipboard.writeText(rootPassword);
                message.success('Password copied to clipboard');
              }}
            >
              Copy to Clipboard
            </Button>
            <Button 
              type="link" 
              onClick={() => setRootPassword(null)}
            >
              Dismiss
            </Button>
          </Space>
        </Card>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Status"
              value={server.status}
              valueStyle={{ color: server.status === 'running' ? '#3f8600' : server.status === 'off' ? '#cf1322' : '#1677ff' }}
              prefix={getStatusIcon(server.status)}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Server Type"
              value={server.server_type || 'N/A'}
              prefix={<HddOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="IP Address"
              value={server.ip || 'N/A'}
              valueStyle={{ fontSize: '16px' }}
            />
          </Card>
        </Col>
      </Row>
      <Card
        title="Server Details"
        style={{ marginTop: 16 }}
        extra={
          <Space>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              disabled={server.status === 'running' || actionLoading}
              loading={actionLoading}
              onClick={() => handleServerAction('power_on', 'Power On')}
            >
              Power On
            </Button>
            <Button
              danger
              icon={<PoweroffOutlined />}
              disabled={server.status === 'off' || actionLoading}
              loading={actionLoading}
              onClick={() => handleServerAction('power_off', 'Power Off')}
            >
              Power Off
            </Button>
            <Button
              icon={<RedoOutlined />}
              disabled={server.status !== 'running' || actionLoading}
              loading={actionLoading}
              onClick={() => handleServerAction('reboot', 'Reboot')}
            >
              Reboot
            </Button>
            
            <Dropdown overlay={actionsMenu} disabled={actionLoading}>
              <Button>
                More Actions <DownOutlined />
              </Button>
            </Dropdown>
          </Space>
        }
      >
        <Descriptions bordered column={{ xxl: 3, xl: 2, lg: 2, md: 1, sm: 1, xs: 1 }}>
          <Descriptions.Item label="ID">{server.id}</Descriptions.Item>
          <Descriptions.Item label="Name">{server.name}</Descriptions.Item>
          <Descriptions.Item label="Status">
            <Tag color={getStatusColor(server.status)}>{server.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="IP Address">{server.ip || 'N/A'}</Descriptions.Item>
          <Descriptions.Item label="Location">{server.location || 'N/A'}</Descriptions.Item>
          <Descriptions.Item label="Server Type">{server.server_type || 'N/A'}</Descriptions.Item>
          <Descriptions.Item label="Image">{server.image || 'N/A'}</Descriptions.Item>
          <Descriptions.Item label="Created">
            {server.created ? moment(server.created).format('YYYY-MM-DD HH:mm:ss') : 'N/A'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <RebuildServerModal
        visible={rebuildModalVisible}
        onCancel={() => setRebuildModalVisible(false)}
        onSubmit={handleRebuildServer}
        projectId={projectId}
      />

      <RescueModeModal
        visible={rescueModalVisible}
        onCancel={() => setRescueModalVisible(false)}
        onSubmit={handleEnableRescue}
        projectId={projectId}
        serverId={serverId}
      />

      <AttachISOModal
        visible={isoModalVisible}
        onCancel={() => setISOModalVisible(false)}
        onSubmit={handleAttachISO}
        projectId={projectId}
      />
    </div>
  );
}

export default ServerDetailPanel;