// src/components/servers/RdnsModal.js
import React, { useState } from 'react';
import { Modal, Form, Input, Alert } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';

function RdnsModal({ visible, onCancel, onSubmit, loading, serverIP }) {
  const [ip, setIp] = useState(serverIP || '');
  const [dnsPtr, setDnsPtr] = useState('');

  const handleSubmit = () => {
    onSubmit(ip, dnsPtr);
  };

  return (
    <Modal
      title="Change Reverse DNS"
      open={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText="Update rDNS"
      okButtonProps={{ loading }}
    >
      <Alert
        message="Reverse DNS Information"
        description={
          <div>
            <p>Reverse DNS (PTR) records are used to map an IP address to a hostname. This is useful for services like mail servers to verify the identity of the server.</p>
            <p><strong>Example:</strong> If you want emails from your server to be less likely marked as spam, set up a reverse DNS record that matches your mail server's hostname.</p>
          </div>
        }
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      
      <Form layout="vertical">
        <Form.Item
          label="IP Address"
          required
          help="This is your server's IP address"
        >
          <Input 
            prefix={<GlobalOutlined />}
            value={ip}
            onChange={e => setIp(e.target.value)}
            placeholder="192.168.1.1"
            disabled={!!serverIP}
          />
        </Form.Item>
        
        <Form.Item
          label="Reverse DNS Entry"
          required
          help="Enter the hostname that should be associated with this IP"
        >
          <Input 
            value={dnsPtr}
            onChange={e => setDnsPtr(e.target.value)}
            placeholder="server.example.com"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default RdnsModal;