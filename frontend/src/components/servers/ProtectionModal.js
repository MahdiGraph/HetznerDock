import React, { useState } from 'react';
import { Modal, Form, Checkbox, Alert, Space, Typography, message } from 'antd';
import { SafetyOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

function ProtectionModal({ visible, onCancel, onSubmit, loading, isEnable = true, currentProtection = {} }) {
  const [form] = Form.useForm();

  const handleSubmit = () => {
    form.validateFields()
      .then(values => {
        onSubmit({
          delete: values.delete_protection,
          rebuild: values.rebuild_protection
        });
      })
      .catch(info => {
        console.log('Validate Failed:', info);
      });
  };

  return (
    <Modal
      title={`${isEnable ? 'Enable' : 'Disable'} Server Protection`}
      open={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText={isEnable ? "Enable Protection" : "Disable Protection"}
      okButtonProps={{ loading }}
    >
      <Alert
        message={
          <Space>
            <SafetyOutlined />
            {isEnable ? "Enable protection features" : "Disable protection features"}
          </Space>
        }
        description={
          isEnable 
            ? "Protecting your server prevents accidental deletion or rebuilding. You can disable these protections later if needed."
            : "Disabling protection will allow this server to be deleted or rebuilt. Only disable protection if you're sure you want to perform these operations."
        }
        type={isEnable ? "info" : "warning"}
        showIcon
        style={{ marginBottom: 16 }}
      />
      
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          delete_protection: currentProtection.delete || false,
          rebuild_protection: currentProtection.rebuild || false
        }}
      >
        <Form.Item
          name="delete_protection"
          valuePropName="checked"
        >
          <Checkbox>
            <Text strong>Delete Protection</Text> - Prevents accidental deletion of this server
          </Checkbox>
        </Form.Item>
        
        <Form.Item
          name="rebuild_protection"
          valuePropName="checked"
        >
          <Checkbox>
            <Text strong>Rebuild Protection</Text> - Prevents accidental rebuilding of this server
          </Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default ProtectionModal;