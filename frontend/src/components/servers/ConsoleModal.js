import React from 'react';
import { Modal, Button, Alert, Typography, Input, Spin, message } from 'antd';
import { LinkOutlined, CopyOutlined, LoginOutlined } from '@ant-design/icons';
const { Text, Paragraph } = Typography;

function ConsoleModal({ open, onCancel, consoleData, loading, error }) {
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    message.success('Copied to clipboard');
  };

  const openConsole = () => {
    console.log("Opening console with URL:", consoleData?.wss_url);
    if (consoleData?.wss_url) {
      try {
        // بازکردن URL در یک پنجره جدید با پارامترهای امنیتی
        const newWindow = window.open(consoleData.wss_url, '_blank', 'noopener,noreferrer');
        
        // بررسی اگر پنجره به درستی باز شده باشد
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
          message.warn("Please allow pop-ups for this site to open the console.");
        }
      } catch (error) {
        console.error("Error opening console:", error);
        message.error("Failed to open console. Please check your browser settings.");
      }
    } else {
      console.error("No wss_url available in consoleData:", consoleData);
      message.error("Console URL not available.");
    }
  };

  return (
    <Modal
      title="VNC Console Access"
      open={open}
      onCancel={onCancel}
      footer={[
        <Button key="close" onClick={onCancel}>
          Close
        </Button>,
        consoleData?.wss_url && (
          <Button key="open" type="primary" icon={<LoginOutlined />} onClick={openConsole}>
            Open Console
          </Button>
        )
      ]}
      width={600}
    >
      {error ? (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
        />
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Requesting console access...</div>
        </div>
      ) : consoleData ? (
        <>
          <Alert
            message="Console Access Granted"
            description="You can now access the VNC console of your server. The credentials below will expire soon, so use them immediately."
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Paragraph>
            <Text strong>Console URL:</Text>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
              <Input
                value={consoleData.wss_url}
                readOnly
                addonAfter={
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => copyToClipboard(consoleData.wss_url)}
                    type="text"
                    size="small"
                  />
                }
              />
            </div>
          </Paragraph>
          <Paragraph>
            <Text strong>Password:</Text>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
              <Input
                value={consoleData.password}
                readOnly
                addonAfter={
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => copyToClipboard(consoleData.password)}
                    type="text"
                    size="small"
                  />
                }
              />
            </div>
          </Paragraph>
          {consoleData.expires_at && (
            <Paragraph>
              <Text strong>Expires:</Text> {new Date(consoleData.expires_at).toLocaleString()}
            </Paragraph>
          )}
          <Alert
            message="Note"
            description="The console access is temporary and will expire. If you need access later, request a new console session."
            type="info"
            showIcon
          />
        </>
      ) : (
        <Alert
          message="No console data"
          description="No console data is available. Please try requesting again."
          type="warning"
          showIcon
        />
      )}
    </Modal>
  );
}

export default ConsoleModal;