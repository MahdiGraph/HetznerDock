import React, { useState } from 'react';
import { Modal, Form, Input, Alert, message } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';

function RdnsModal({ visible, onCancel, onSubmit, loading, serverIP }) {
  const [form] = Form.useForm();

  const handleSubmit = () => {
    form.validateFields()
      .then(values => {
        onSubmit(values.ip, values.dns_ptr);
      })
      .catch(info => {
        console.log('Validate Failed:', info);
      });
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
        description="Reverse DNS (PTR) records are used to map an IP address to a hostname. This is useful for services like mail servers to verify the identity of the server."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          ip: serverIP || '',
          dns_ptr: ''
        }}
      >
        <Form.Item
          name="ip"
          label="IP Address"
          rules={[
            { required: true, message: 'Please enter an IP address' },
            { 
              pattern: /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/, 
              message: 'Please enter a valid IPv4 address' 
            }
          ]}
        >
          <Input 
            prefix={<GlobalOutlined />}
            placeholder="192.168.1.1"
            disabled={!!serverIP}
          />
        </Form.Item>
        
        <Form.Item
          name="dns_ptr"
          label="Reverse DNS Entry"
          rules={[
            { required: true, message: 'Please enter a hostname' },
            { 
              pattern: /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/, 
              message: 'Please enter a valid hostname (e.g., server.example.com)' 
            }
          ]}
        >
          <Input 
            placeholder="server.example.com"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default RdnsModal;