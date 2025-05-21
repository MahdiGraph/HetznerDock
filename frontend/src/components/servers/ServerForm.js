import React, { useState, useEffect } from 'react';
import { 
  Form, Input, Select, Button, Card, Alert, message, Spin 
} from 'antd';
import * as serverService from '../../api/services/serverService';

const { Option } = Select;

function ServerForm({ projectId, onSuccess }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [images, setImages] = useState([]);
  const [serverTypes, setServerTypes] = useState([]);
  
  useEffect(() => {
    if (projectId) {
      fetchOptions();
    }
  }, [projectId]);
  
  const fetchOptions = async () => {
    setLoading(true);
    try {
      // Fetch images and server types in parallel
      const [imagesResponse, serverTypesResponse] = await Promise.all([
        serverService.getImages(projectId),
        serverService.getServerTypes(projectId)
      ]);
      
      setImages(imagesResponse.images || []);
      setServerTypes(serverTypesResponse.server_types || []);
    } catch (error) {
      setError('Failed to load required options. Please try again.');
      message.error('Failed to load server options');
    } finally {
      setLoading(false);
    }
  };
  
  const handleSubmit = async (values) => {
    setSubmitting(true);
    setError('');
    
    try {
      const response = await serverService.createServer(projectId, {
        name: values.name,
        server_type: values.server_type,
        image: values.image,
        location: values.location
      });
      
      message.success('Server created successfully');
      
      // Display a special message with root password if available
      if (response.root_password) {
        Modal.success({
          title: 'Server Created Successfully',
          content: (
            <div>
              <p>Your server has been created. Here is your root password:</p>
              <Alert
                message="Root Password (Save this now!)"
                description={response.root_password}
                type="warning"
                showIcon
              />
              <p style={{ marginTop: 16 }}>This password will only be shown once.</p>
            </div>
          ),
        });
      }
      
      form.resetFields();
      if (onSuccess) {
        onSuccess(response);
      }
    } catch (error) {
      setError(error.response?.data?.detail || 'Failed to create server');
    } finally {
      setSubmitting(false);
    }
  };
  
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <Spin size="large" />
        <p style={{ marginTop: 16 }}>Loading server options...</p>
      </div>
    );
  }
  
  // Filter out non-distribution images (apps, snapshots, backups)
  const distributionImages = images.filter(image => 
    image.type === 'system' && image.os_flavor
  );
  
  return (
    <Card title="Create New Server">
      {error && <Alert message={error} type="error" style={{ marginBottom: 16 }} />}
      
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          location: 'nbg1'  // Default to Nuremberg
        }}
      >
        <Form.Item
          name="name"
          label="Server Name"
          rules={[{ required: true, message: 'Please input the server name!' }]}
        >
          <Input placeholder="my-server" />
        </Form.Item>
        
        <Form.Item
          name="server_type"
          label="Server Type"
          rules={[{ required: true, message: 'Please select a server type!' }]}
        >
          <Select 
            placeholder="Select server type"
            showSearch
            optionFilterProp="children"
          >
            {serverTypes.map(type => (
              <Option key={type.name} value={type.name}>
                {type.name} - {type.description} ({type.cores} CPU, {type.memory}GB RAM, {type.disk}GB Disk)
              </Option>
            ))}
          </Select>
        </Form.Item>
        
        <Form.Item
          name="image"
          label="Operating System"
          rules={[{ required: true, message: 'Please select an operating system!' }]}
        >
          <Select 
            placeholder="Select operating system"
            showSearch
            optionFilterProp="children"
          >
            {distributionImages.map(image => (
              <Option key={image.id} value={image.name}>
                {image.description || image.name} ({image.os_flavor})
              </Option>
            ))}
          </Select>
        </Form.Item>
        
        <Form.Item
          name="location"
          label="Location"
        >
          <Select placeholder="Select datacenter location">
            <Option value="nbg1">Nuremberg, Germany</Option>
            <Option value="fsn1">Falkenstein, Germany</Option>
            <Option value="hel1">Helsinki, Finland</Option>
            <Option value="ash">Ashburn, VA, USA</Option>
          </Select>
        </Form.Item>
        
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting} block>
            Create Server
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}

export default ServerForm;