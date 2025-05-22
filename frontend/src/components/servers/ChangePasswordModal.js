import React, { useState } from 'react';
import { Modal, Form, Input, Button, Alert } from 'antd';
import { LockOutlined } from '@ant-design/icons';

function ChangePasswordModal({ visible, onCancel, onSubmit, loading }) {
  const [form] = Form.useForm();

  const handleSubmit = () => {
    form.validateFields()
      .then(values => {
        onSubmit(values.password);
      })
      .catch(info => {
        console.log('Validate Failed:', info);
      });
  };

  return (
    <Modal
      title="Change Server Password"
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="back" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="submit" type="primary" onClick={handleSubmit} loading={loading}>
          Change Password
        </Button>
      ]}
    >
      <Alert
        message="Warning"
        description="This will reset the root password for your server. Make sure you save the new password securely."
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Form
        form={form}
        layout="vertical"
      >
        <Form.Item
          name="password"
          label="New Password"
          rules={[
            { required: true, message: 'Please enter a new password' },
            { min: 10, message: 'Password must be at least 10 characters long' }
          ]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="Enter new password"
          />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          label="Confirm Password"
          dependencies={['password']}
          rules={[
            { required: true, message: 'Please confirm your password' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('The two passwords do not match'));
              },
            }),
          ]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="Confirm password"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default ChangePasswordModal;