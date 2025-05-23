import React from 'react';
import { Modal, Button, Alert, Typography, Input, Spin, message } from 'antd';
import { LinkOutlined, CopyOutlined, LoginOutlined } from '@ant-design/icons';
import { VncScreen } from 'react-vnc';
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
    <Modal title="VNC Console Access" open={open} onCancel={onCancel} width={800}  // widen modal
      footer={[
        <Button key="close" onClick={onCancel}>Close</Button>
      ]}>
      {error ? (
        <Alert message="Error" description={error} type="error" showIcon />
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Requesting console access...</div>
        </div>
      ) : consoleData ? (
        <>
          <Alert message="Console Access Granted"
                 description="Using the embedded VNC client below. The session will expire shortly, so connect now."
                 type="success" showIcon style={{ marginBottom: 16 }} />
          {/* Embed the VNC screen */}
          <div style={{ height: '600px', background: '#000' }}>
            <VncScreen url={consoleData.wss_url} password={consoleData.password}
                       scaleViewport background="#000" />
          </div>
        </>
      ) : null}
    </Modal>
  );
}

export default ConsoleModal;