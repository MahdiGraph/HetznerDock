import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, Alert, Spin, message } from 'antd';
import * as serverService from '../../api/services/serverService';

function RebuildServerModal({ visible, onCancel, onSubmit, projectId }) {
  const [form] = Form.useForm();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible && projectId) {
      fetchImages();
    }
  }, [visible, projectId]);

  const fetchImages = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await serverService.getImages(projectId);
      setImages(response.images || []);
    } catch (err) {
      setError('Failed to load images. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      onSubmit(values.image);
    } catch (err) {
      console.error('Validation failed:', err);
    }
  };

  // Filter only system images for rebuild
  const systemImages = images.filter(image => 
    image.type === 'system' && image.os_flavor
  );

  return (
    <Modal
      title="Rebuild Server"
      open={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText="Rebuild"
      okButtonProps={{ danger: true }}
      confirmLoading={loading}
    >
      <Alert
        message="Warning: Rebuilding a server will erase all data!"
        description="This action will reinstall the server with a new operating system. All data on the server will be permanently deleted. This action cannot be undone."
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
      />
      
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Spin />
          <p>Loading images...</p>
        </div>
      ) : error ? (
        <Alert message={error} type="error" />
      ) : (
        <Form form={form} layout="vertical">
          <Form.Item
            name="image"
            label="Select New Image"
            rules={[{ required: true, message: 'Please select an image' }]}
          >
            <Select placeholder="Select an operating system">
              {systemImages.map(image => (
                <Select.Option key={image.id} value={image.name}>
                  {image.description || image.name} ({image.os_flavor})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}

export default RebuildServerModal;