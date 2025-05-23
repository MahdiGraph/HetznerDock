import React, { useState, useEffect } from 'react';
import { Modal, Form, Checkbox, Alert, Space, Typography } from 'antd';
import { SafetyOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

function ProtectionModal({ open, onCancel, onSubmit, loading, isEnable = true, currentProtection = {} }) {
  const [form] = Form.useForm();
  const [deleteProtection, setDeleteProtection] = useState(currentProtection.delete || false);
  const [rebuildProtection, setRebuildProtection] = useState(currentProtection.rebuild || false);

  // Reset checkboxes each time the modal is opened with new data
  useEffect(() => {
    if (open) {
      setDeleteProtection(currentProtection.delete || false);
      setRebuildProtection(currentProtection.rebuild || false);
    }
  }, [open, currentProtection]);

  const handleSubmit = () => {
    onSubmit({
      delete: deleteProtection,
      rebuild: rebuildProtection
    });
  };

  return (
    <Modal
      title={`${isEnable ? 'Enable' : 'Disable'} Server Protection`}
      open={open}
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
          <div>
            <p>{isEnable 
              ? "Protecting your server prevents accidental deletion or rebuilding. You can disable these protections later if needed."
              : "Disabling protection will allow this server to be deleted or rebuilt. Only disable protection if you're sure you want to perform these operations."
            }</p>
            <p><strong>What is Server Protection?</strong></p>
            <p>Server protection provides safeguards against accidental deletion or rebuilding of important servers. It works as a safety mechanism for your critical infrastructure.</p>
          </div>
        }
        type={isEnable ? "info" : "warning"}
        showIcon
        style={{ marginBottom: 16 }}
      />
      
      <div style={{ marginBottom: 16 }}>
        <Checkbox 
          checked={deleteProtection}
          onChange={e => setDeleteProtection(e.target.checked)}
        >
          <Text strong>Delete Protection</Text> - Prevents accidental deletion of this server
        </Checkbox>
      </div>
      
      <div>
        <Checkbox 
          checked={rebuildProtection}
          onChange={e => setRebuildProtection(e.target.checked)}
        >
          <Text strong>Rebuild Protection</Text> - Prevents accidental rebuilding of this server
        </Checkbox>
      </div>
    </Modal>
  );
}

export default ProtectionModal;
