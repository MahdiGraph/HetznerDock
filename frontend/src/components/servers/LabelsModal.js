// src/components/servers/LabelsModal.js
import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, Space, Divider, Tag } from 'antd';
import { PlusOutlined, TagOutlined } from '@ant-design/icons';

function LabelsModal({ visible, onCancel, onSubmit, loading, initialLabels = {} }) {
  const [labels, setLabels] = useState({});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    if (visible) {
      setLabels(initialLabels || {});
    }
  }, [visible, initialLabels]);

  const handleAddLabel = () => {
    if (newKey && newValue) {
      const updatedLabels = {
        ...labels,
        [newKey]: newValue
      };
      setLabels(updatedLabels);
      setNewKey('');
      setNewValue('');
    }
  };

  const handleRemoveLabel = (key) => {
    const newLabels = { ...labels };
    delete newLabels[key];
    setLabels(newLabels);
  };

  const handleSubmit = () => {
    onSubmit(labels);
  };

  return (
    <Modal
      title="Manage Server Labels"
      open={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText="Save Labels"
      okButtonProps={{ loading }}
    >
      <p>Labels help you organize and categorize your servers. Each label consists of a key and a value.</p>
      
      <Divider orientation="left">Current Labels</Divider>
      
      <div style={{ marginBottom: 16 }}>
        {Object.keys(labels).length > 0 ? (
          <Space wrap>
            {Object.entries(labels).map(([key, value]) => (
              <Tag 
                key={key}
                closable
                onClose={() => handleRemoveLabel(key)}
              >
                <TagOutlined /> {key}: {value}
              </Tag>
            ))}
          </Space>
        ) : (
          <p>No labels set. Add your first label below.</p>
        )}
      </div>
      
      <Divider orientation="left">Add New Label</Divider>
      
      <div style={{ display: 'flex', marginBottom: 16 }}>
        <Input
          placeholder="Key"
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          style={{ width: 120, marginRight: 8 }}
        />
        <Input
          placeholder="Value"
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          style={{ width: 200, marginRight: 8 }}
        />
        <Button 
          icon={<PlusOutlined />} 
          onClick={handleAddLabel}
          disabled={!newKey || !newValue}
        >
          Add
        </Button>
      </div>
    </Modal>
  );
}

export default LabelsModal;