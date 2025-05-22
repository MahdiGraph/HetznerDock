import React, { useEffect } from 'react';
import { Modal, Form, Input, Button } from 'antd';

function SSHKeyForm({ visible, initialValues, onCancel, onSubmit }) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (visible) {
      form.resetFields();
      if (initialValues) {
        form.setFieldsValue({
          name: initialValues.name,
          public_key: initialValues.public_key
        });
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
      title={initialValues ? "Edit SSH Key" : "Add SSH Key"}
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="back" onClick={onCancel}>Cancel</Button>,
        <Button key="submit" type="primary" onClick={handleSubmit}>
          {initialValues ? "Update" : "Create"}
        </Button>
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{}}
      >
        <Form.Item
          name="name"
          label="Name"
          rules={[{ required: true, message: 'Please enter a name for this SSH key' }]}
        >
          <Input placeholder="My SSH Key" />
        </Form.Item>
        <Form.Item
          name="public_key"
          label="Public Key"
          rules={[{ required: true, message: 'Please provide your public SSH key' }]}
        >
          <Input.TextArea 
            placeholder="ssh-rsa AAAAB3NzaC1yc2E..."
            rows={6}
            disabled={!!initialValues}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default SSHKeyForm;