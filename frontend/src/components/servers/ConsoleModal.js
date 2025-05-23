// src/components/servers/ConsoleModal.js
import React, { useState, useEffect } from 'react';
import { Modal, Button, Alert, Typography, Input, Spin, message } from 'antd';
import { LinkOutlined, CopyOutlined, LoginOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

function ConsoleModal({ open, onCancel, consoleData, loading, error }) {
  const [showVNC, setShowVNC] = useState(false);
  
  // Reset state when modal is closed
  useEffect(() => {
    if (!open) {
      setShowVNC(false);
    }
  }, [open]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    message.success('Copied to clipboard');
  };

  const openConsole = () => {
    if (consoleData?.wss_url) {
      // Create a URL for noVNC viewer
      const vncURL = `/novnc/vnc.html?autoconnect=true&path=${encodeURIComponent(
        new URL(consoleData.wss_url).pathname
      )}&password=${encodeURIComponent(consoleData.password)}`;
      
      window.open(vncURL, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Modal
      title="Server Console"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={800}
      style={{ top: 20 }}
      destroyOnClose={true}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" />
          <p style={{ marginTop: 15 }}>Requesting console access...</p>
        </div>
      ) : error ? (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
        />
      ) : consoleData ? (
        <>
          <Alert
            message="Connection Information"
            description={
              <div>
                <p>
                  Use this information to connect to your server console.
                  The connection will expire after one hour.
                </p>
                <p>
                  You can either use the embedded console below or open 
                  it in a new tab for a better experience.
                </p>
              </div>
            }
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          
          <div style={{ marginBottom: 16 }}>
            <Text strong>WebSocket URL:</Text>
            <Input.Group compact>
              <Input
                style={{ width: 'calc(100% - 32px)' }}
                value={consoleData.wss_url}
                readOnly
              />
              <Button 
                icon={<CopyOutlined />}
                onClick={() => copyToClipboard(consoleData.wss_url)}
                title="Copy to clipboard"
              />
            </Input.Group>
          </div>
          
          <div style={{ marginBottom: 16 }}>
            <Text strong>Password:</Text>
            <Input.Group compact>
              <Input
                style={{ width: 'calc(100% - 32px)' }}
                value={consoleData.password}
                readOnly
              />
              <Button 
                icon={<CopyOutlined />}
                onClick={() => copyToClipboard(consoleData.password)}
                title="Copy to clipboard"
              />
            </Input.Group>
          </div>
          
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center', gap: 8 }}>
            <Button 
              type="primary" 
              icon={<LinkOutlined />}
              onClick={() => setShowVNC(!showVNC)}
            >
              {showVNC ? 'Hide' : 'Show'} Embedded Console
            </Button>
            <Button 
              icon={<LoginOutlined />}
              onClick={openConsole}
            >
              Open in New Tab
            </Button>
          </div>
          
          {showVNC && (
            <div style={{ height: '500px', border: '1px solid #d9d9d9', borderRadius: '2px', overflow: 'hidden' }}>
              <iframe
                src={`/novnc/vnc.html?autoconnect=true&path=${encodeURIComponent(
                  new URL(consoleData.wss_url).pathname
                )}&password=${encodeURIComponent(consoleData.password)}`}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="VNC Console"
                allow="clipboard-read; clipboard-write"
              />
            </div>
          )}
        </>
      ) : null}
    </Modal>
  );
}

export default ConsoleModal;