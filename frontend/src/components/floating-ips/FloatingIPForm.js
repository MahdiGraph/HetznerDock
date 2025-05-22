import React from 'react';
import { Modal, Form, Input, Select, Radio } from 'antd';

function FloatingIPForm({ visible, onCancel, onSubmit }) {
  const [form] = Form.useForm();

  const handleSubmit = () => {
    form.validateFields()
      .then(values => {
        onSubmit(values);
        form.resetFields();
      })
      .catch(info => {
        console.log('Validate Failed:', info);
      });
  };

  return (
    <Modal
      title="Create Floating IP"
      open={visible}
      onOk={handleSubmit}
      onCancel={onCancel}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ type: 'ipv4' }}
      >
        <Form.Item
          name="type"
          label="IP Type"
          rules={[{ required: true, message: 'Please select the IP type' }]}
        >
          <Radio.Group>
            <Radio value="ipv4">IPv4</Radio>
            <Radio value="ipv6">IPv6</Radio>
          </Radio.Group>
        </Form.Item>
        
        <Form.Item
          name="description"
          label="Description"
        >
          <Input placeholder="Optional description" />
        </Form.Item>
        
        <Form.Item
          name="home_location"
          label="Home Location"
        >
          <Select placeholder="Select a location">
            <Select.Option value="nbg1">Nuremberg, Germany</Select.Option>
            <Select.Option value="fsn1">Falkenstein, Germany</Select.Option>
            <Select.Option value="hel1">Helsinki, Finland</Select.Option>
            <Select.Option value="ash">Ashburn, VA, USA</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default FloatingIPForm;