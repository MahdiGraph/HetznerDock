import React, { useEffect } from 'react';
import { Form, Input, Button, Modal } from 'antd';

function ProjectForm({ visible, initialValues, onCancel, onSubmit, confirmLoading, title }) {
  const [form] = Form.useForm();
  
  useEffect(() => {
    if (visible) {
      form.resetFields();
      if (initialValues) {
        form.setFieldsValue(initialValues);
      }
    }
  }, [visible, initialValues, form]);
  
  const handleSubmit = () => {
    form.validateFields()
      .then(values => {
        onSubmit(values);
      })
      .catch(info => {
        console.log('Validate Failed:', info);
      });
  };
  
  return (
    <Modal
      title={title || "Add Project"}
      open={visible}
      onCancel={onCancel}
      confirmLoading={confirmLoading}
      onOk={handleSubmit}
      okText={initialValues ? "Update" : "Create"}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={initialValues || {}}
      >
        <Form.Item
          name="name"
          label="Project Name"
          rules={[{ required: true, message: 'Please input the project name!' }]}
        >
          <Input placeholder="My Hetzner Project" />
        </Form.Item>
        
        <Form.Item
          name="api_key"
          label="Hetzner API Key"
          rules={[{ required: true, message: 'Please input your Hetzner API key!' }]}
        >
          <Input.Password placeholder="Your Hetzner API key" />
        </Form.Item>
        
        <Form.Item
          name="description"
          label="Description"
        >
          <Input.TextArea placeholder="Project description (optional)" rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default ProjectForm;