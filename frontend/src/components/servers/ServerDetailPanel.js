import React, { useState, useEffect } from 'react';
import {
  Descriptions, Button, Card, Space, message, Statistic, Row, Col, Tag, Dropdown, Modal, Form, Input
} from 'antd';
import {
  PoweroffOutlined, PlayCircleOutlined, RedoOutlined,
  LoadingOutlined, ArrowUpOutlined, ClockCircleOutlined,
  HddOutlined, ReloadOutlined, DownOutlined, EditOutlined,
  SafetyOutlined, UndoOutlined, SaveOutlined, KeyOutlined,
  GlobalOutlined, TagOutlined, CameraOutlined, DesktopOutlined,
  RiseOutlined
} from '@ant-design/icons';
import * as serverService from '../../api/services/serverService';
import moment from 'moment';
import RebuildServerModal from './RebuildServerModal';
import RescueModeModal from './RescueModeModal';
import AttachISOModal from './AttachISOModal';
import ChangePasswordModal from './ChangePasswordModal';
import ChangeTypeModal from './ChangeTypeModal';
import ProtectionModal from './ProtectionModal';
import RdnsModal from './RdnsModal';
import LabelsModal from './LabelsModal';
import CreateImageModal from './CreateImageModal';
import ConsoleModal from './ConsoleModal';

function ServerDetailPanel({ projectId, serverId }) {
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [serverNewName, setServerNewName] = useState('');
  const [server, setServer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // State for advanced actions modals
  const [rebuildModalVisible, setRebuildModalVisible] = useState(false);
  const [rescueModalVisible, setRescueModalVisible] = useState(false);
  const [isoModalVisible, setISOModalVisible] = useState(false);
  const [rootPassword, setRootPassword] = useState(null);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [changeTypeModalVisible, setChangeTypeModalVisible] = useState(false);
  const [protectionModalVisible, setProtectionModalVisible] = useState(false);
  const [enableProtection, setEnableProtection] = useState(true);
  const [rdnsModalVisible, setRdnsModalVisible] = useState(false);
  const [labelsModalVisible, setLabelsModalVisible] = useState(false);
  const [createImageModalVisible, setCreateImageModalVisible] = useState(false);
  const [consoleModalVisible, setConsoleModalVisible] = useState(false);
  const [consoleData, setConsoleData] = useState(null);
  const [consoleError, setConsoleError] = useState(null);

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

  const handleRenameServer = async () => {
    try {
      setActionLoading(true);
      await serverService.renameServer(projectId, serverId, serverNewName);
      message.success('Server renamed successfully');
      setRenameModalVisible(false);
      fetchServerDetails();
    } catch (error) {
      message.error(`Failed to rename server: ${error.response?.data?.detail || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangePassword = async (password) => {
    try {
      setActionLoading(true);
      const result = await serverService.changeServerPassword(projectId, serverId, password);
      message.success('Password changed successfully');
      setPasswordModalVisible(false);
      // اگر پسورد جدید در پاسخ باشد، آن را نمایش می‌دهیم
      if (result.root_password) {
        setRootPassword(result.root_password);
      }
    } catch (error) {
      message.error(`Failed to change password: ${error.response?.data?.detail || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeType = async (serverType, upgradeDisk) => {
    try {
      setActionLoading(true);
      await serverService.changeServerType(projectId, serverId, serverType, upgradeDisk);
      message.success(`Server type change to ${serverType} initiated. This may take a few minutes.`);
      setChangeTypeModalVisible(false);
      fetchServerDetails();
    } catch (error) {
      message.error(`Failed to change server type: ${error.response?.data?.detail || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleProtection = async (protection) => {
    try {
      setActionLoading(true);
      if (enableProtection) {
        await serverService.enableServerProtection(projectId, serverId, protection);
        message.success('Server protection enabled successfully');
      } else {
        await serverService.disableServerProtection(projectId, serverId, protection);
        message.success('Server protection disabled successfully');
      }
      setProtectionModalVisible(false);
      fetchServerDetails();
    } catch (error) {
      message.error(`Failed to update protection: ${error.response?.data?.detail || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeRdns = async (ip, dnsPtr) => {
    try {
      setActionLoading(true);
      await serverService.changeServerRdns(projectId, serverId, ip, dnsPtr);
      message.success('Reverse DNS updated successfully');
      setRdnsModalVisible(false);
      fetchServerDetails();
    } catch (error) {
      message.error(`Failed to update reverse DNS: ${error.response?.data?.detail || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateLabels = async (labels) => {
    try {
      setActionLoading(true);
      await serverService.updateServerLabels(projectId, serverId, labels);
      message.success('Labels updated successfully');
      setLabelsModalVisible(false);
      fetchServerDetails();
    } catch (error) {
      message.error(`Failed to update labels: ${error.response?.data?.detail || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateImage = async (imageData) => {
    try {
      setActionLoading(true);
      const result = await serverService.createServerImage(projectId, serverId, imageData);
      message.success(`Image created successfully: ${result.image.description}`);
      setCreateImageModalVisible(false);
      // اگر پسورد نیاز باشد
      if (result.root_password) {
        setRootPassword(result.root_password);
      }
    } catch (error) {
      message.error(`Failed to create image: ${error.response?.data?.detail || error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestConsole = async () => {
    try {
      setActionLoading(true);
      setConsoleError(null);
      const result = await serverService.requestServerConsole(projectId, serverId);
      // نمایش اطلاعات وضعیت در کنسول برای عیب‌یابی
      console.log("Console data:", result);
      setConsoleData(result);
      setConsoleModalVisible(true);
    } catch (error) {
      console.error("Console error:", error);
      setConsoleError(`Failed to request console: ${error.response?.data?.detail || error.message}`);
      setConsoleModalVisible(true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async () => {
    Modal.confirm({
      title: 'Reset Server Password',
      content: 'Are you sure you want to reset the root password? This will generate a new random password.',
      okText: 'Yes, Reset Password',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setActionLoading(true);
          const result = await serverService.resetServerPassword(projectId, serverId);
          message.success('Password reset successfully');
          if (result.root_password) {
            setRootPassword(result.root_password);
          }
        } catch (error) {
          message.error(`Failed to reset password: ${error.response?.data?.detail || error.message}`);
        } finally {
          setActionLoading(false);
        }
      }
    });
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

  // تعریف آیتم‌های منوی More Actions با ساختار جدید
  const actionsMenuItems = [
    {
      key: 'rename',
      icon: <EditOutlined />,
      label: 'Rename Server',
      onClick: () => {
        setServerNewName(server.name);
        setRenameModalVisible(true);
      }
    },
    {
      key: 'change_password',
      icon: <KeyOutlined />,
      label: 'Change Password',
      onClick: () => setPasswordModalVisible(true)
    },
    {
      key: 'change_type',
      icon: <RiseOutlined />,
      label: 'Change Server Type',
      onClick: () => setChangeTypeModalVisible(true)
    },
    {
      type: 'divider'
    },
    {
      key: 'enable_protection',
      icon: <SafetyOutlined />,
      label: 'Enable Protection',
      onClick: () => {
        setEnableProtection(true);
        setProtectionModalVisible(true);
      }
    },
    {
      key: 'disable_protection',
      icon: <SafetyOutlined />,
      label: 'Disable Protection',
      onClick: () => {
        setEnableProtection(false);
        setProtectionModalVisible(true);
      }
    },
    {
      type: 'divider'
    },
    {
      key: 'rdns',
      icon: <GlobalOutlined />,
      label: 'Manage Reverse DNS',
      onClick: () => setRdnsModalVisible(true)
    },
    {
      key: 'labels',
      icon: <TagOutlined />,
      label: 'Manage Labels',
      onClick: () => setLabelsModalVisible(true)
    },
    {
      type: 'divider'
    },
    {
      key: 'create_image',
      icon: <CameraOutlined />,
      label: 'Create Image/Snapshot',
      onClick: () => setCreateImageModalVisible(true)
    },
    {
      key: 'request_console',
      icon: <DesktopOutlined />,
      label: 'Access Console',
      onClick: handleRequestConsole
    },
    {
      key: 'reset_password',
      icon: <KeyOutlined />,
      label: 'Reset Password',
      onClick: handleResetPassword
    },
    {
      type: 'divider'
    },
    {
      key: 'rebuild',
      icon: <ReloadOutlined />,
      label: 'Rebuild Server',
      onClick: () => setRebuildModalVisible(true)
    },
    {
      key: 'reset',
      icon: <UndoOutlined />,
      label: 'Hard Reset',
      onClick: () => handleServerAction('reset', 'Reset')
    },
    {
      key: 'rescue_mode',
      icon: <SafetyOutlined />,
      label: 'Enable Rescue Mode',
      onClick: () => setRescueModalVisible(true)
    },
    {
      key: 'disable_rescue',
      icon: <SafetyOutlined />,
      label: 'Disable Rescue Mode',
      onClick: handleDisableRescue
    },
    {
      key: 'iso_attach',
      icon: <SaveOutlined />,
      label: 'Attach ISO',
      onClick: () => setISOModalVisible(true)
    },
    {
      key: 'iso_detach',
      icon: <SaveOutlined />,
      label: 'Detach ISO',
      onClick: handleDetachISO
    }
  ];

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
            {/* استفاده از فرمت جدید Dropdown در Ant Design */}
            <Dropdown menu={{ items: actionsMenuItems }} disabled={actionLoading}>
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
      
      {/* مدال‌ها با پراپرتی open به جای visible برای سازگاری با نسخه جدید Ant Design */}
      <RebuildServerModal
        open={rebuildModalVisible}
        onCancel={() => setRebuildModalVisible(false)}
        onSubmit={handleRebuildServer}
        projectId={projectId}
      />
      <RescueModeModal
        open={rescueModalVisible}
        onCancel={() => setRescueModalVisible(false)}
        onSubmit={handleEnableRescue}
        projectId={projectId}
        serverId={serverId}
      />
      <AttachISOModal
        open={isoModalVisible}
        onCancel={() => setISOModalVisible(false)}
        onSubmit={handleAttachISO}
        projectId={projectId}
      />
      <Modal
        title="Rename Server"
        open={renameModalVisible}
        onCancel={() => setRenameModalVisible(false)}
        onOk={handleRenameServer}
        confirmLoading={actionLoading}
      >
        <Form layout="vertical">
          <Form.Item
            label="New Server Name"
            rules={[{ required: true, message: 'Please enter a new name for the server' }]}
          >
            <Input
              value={serverNewName}
              onChange={e => setServerNewName(e.target.value)}
              placeholder="Enter new server name"
            />
          </Form.Item>
        </Form>
      </Modal>
      <ChangePasswordModal
        open={passwordModalVisible}
        onCancel={() => setPasswordModalVisible(false)}
        onSubmit={handleChangePassword}
        loading={actionLoading}
      />
      <ChangeTypeModal
        open={changeTypeModalVisible}
        onCancel={() => setChangeTypeModalVisible(false)}
        onSubmit={handleChangeType}
        projectId={projectId}
        currentType={server?.server_type}
        loading={actionLoading}
      />
      <ProtectionModal
        open={protectionModalVisible}
        onCancel={() => setProtectionModalVisible(false)}
        onSubmit={handleProtection}
        loading={actionLoading}
        isEnable={enableProtection}
        currentProtection={{
          delete: server?.protection?.delete,
          rebuild: server?.protection?.rebuild
        }}
      />
      <RdnsModal
        open={rdnsModalVisible}
        onCancel={() => setRdnsModalVisible(false)}
        onSubmit={handleChangeRdns}
        loading={actionLoading}
        serverIP={server?.ip}
      />
      <LabelsModal
        open={labelsModalVisible}
        onCancel={() => setLabelsModalVisible(false)}
        onSubmit={handleUpdateLabels}
        loading={actionLoading}
        initialLabels={server?.labels}
      />
      <CreateImageModal
        open={createImageModalVisible}
        onCancel={() => setCreateImageModalVisible(false)}
        onSubmit={handleCreateImage}
        loading={actionLoading}
      />
      <ConsoleModal
        open={consoleModalVisible}
        onCancel={() => setConsoleModalVisible(false)}
        consoleData={consoleData}
        loading={actionLoading}
        error={consoleError}
      />
    </div>
  );
}

export default ServerDetailPanel;