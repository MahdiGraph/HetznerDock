import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, Alert, Spin, Checkbox, message } from 'antd';
import * as serverService from '../../api/services/serverService';
import * as sshKeyService from '../../api/services/sshKeyService';

function RescueModeModal({ open, onCancel, onSubmit, projectId, serverId }) {
  const [form] = Form.useForm();
  const [sshKeys, setSSHKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && projectId) {
      fetchSSHKeys();
    }
  }, [open, projectId]);

  const fetchSSHKeys = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await sshKeyService.getSSHKeys(projectId);
      setSSHKeys(response.ssh_keys || []);
    } catch (err) {
      setError('Failed to load SSH keys. You can still continue without SSH keys.');
      setSSHKeys([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      onSubmit(values);
    } catch (err) {
      console.error('Validation failed:', err);
    }
  };

  return (
    <Modal
      title="Enable Rescue Mode"
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText="Enable Rescue Mode"
      confirmLoading={loading}
    >
      <Alert
        message="About Rescue Mode"
        description="Rescue mode will boot your server into a minimal Linux environment, allowing you to troubleshoot problems with your server. Your server will be rebooted to enter rescue mode."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      
      <Form form={form} layout="vertical" initialValues={{ type: 'linux64' }}>
        <Form.Item
          name="type"
          label="Rescue System Type"
        >
          <Select>
            <Select.Option value="linux64">Linux 64-bit</Select.Option>
            <Select.Option value="linux32">Linux 32-bit</Select.Option>
            <Select.Option value="freebsd64">FreeBSD 64-bit</Select.Option>
          </Select>
        </Form.Item>
        
        {sshKeys.length > 0 && (
          <Form.Item
            name="ssh_keys"
            label="SSH Keys"
          >
            <Select
              mode="multiple"
              placeholder="Select SSH keys for authentication"
              optionFilterProp="children"
            >
              {sshKeys.map(key => (
                <Select.Option key={key.id} value={key.id}>
                  {key.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

export default RescueModeModal;
