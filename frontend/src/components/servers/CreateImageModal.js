// src/components/servers/CreateImageModal.js
import React, { useState } from 'react';
import { Modal, Form, Input, Radio, Alert } from 'antd';

const { TextArea } = Input;

function CreateImageModal({ visible, onCancel, onSubmit, loading }) {
  const [imageType, setImageType] = useState('snapshot');
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    onSubmit({
      type: imageType,
      description: description
    });
  };

  return (
    <Modal
      title="Create Image"
      open={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText="Create Image"
      okButtonProps={{ loading }}
    >
      <Alert
        message="Note"
        description={
          <div>
            <p>Creating an image allows you to backup your server or create a template for future servers. The server will remain running during this operation.</p>
            <p><strong>Snapshot:</strong> A one-time backup of your server that you can use to restore or create new servers.</p>
            <p><strong>Backup:</strong> A managed backup that will be part of Hetzner's backup system (may incur additional costs).</p>
          </div>
        }
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      
      <Form layout="vertical">
        <Form.Item label="Image Type">
          <Radio.Group 
            value={imageType}
            onChange={e => setImageType(e.target.value)}
          >
            <Radio value="snapshot">Snapshot (One-time backup)</Radio>
            <Radio value="backup">Backup (Managed backup)</Radio>
          </Radio.Group>
        </Form.Item>
        
        <Form.Item 
          label="Description"
          help="Enter a description to identify this image later"
          required
        >
          <TextArea 
            rows={3} 
            placeholder="Enter a description for this image"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default CreateImageModal;