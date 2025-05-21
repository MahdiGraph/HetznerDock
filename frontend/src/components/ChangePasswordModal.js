import React, { useState } from 'react';
import { Modal, Form, Input, Button, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

function ChangePasswordModal({ visible, onCancel }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { changePassword } = useAuth();
  
  const handleSubmit = async (values) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('New passwords do not match!');
      return;
    }
    
    setLoading(true);
    
    try {
      const success = await changePassword(values.oldPassword, values.newPassword);
      if (success) {
        form.resetFields();
        onCancel();
      }
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Modal
      title="Change Password"
      open={visible}
      onCancel={onCancel}
      footer={null}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        <Form.Item
          name="oldPassword"
          label="Current Password"
          rules={[{ required: true, message: 'Please input your current password!' }]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="Current password" />
        </Form.Item>
        
        <Form.Item
          name="newPassword"
          label="New Password"
          rules={[
            { required: true, message: 'Please input your new password!' },
            { min: 8, message: 'Password must be at least 8 characters!' }
          ]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="New password" />
        </Form.Item>
        
        <Form.Item
          name="confirmPassword"
          label="Confirm New Password"
          rules={[
            { required: true, message: 'Please confirm your new password!' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('newPassword') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('Passwords do not match!'));
              },
            }),
          ]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="Confirm new password" />
        </Form.Item>
        
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Change Password
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default ChangePasswordModal;