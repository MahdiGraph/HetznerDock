import React from 'react';
import { Modal, Form, Input, InputNumber, Select, Switch } from 'antd';

function VolumeForm({ visible, onCancel, onSubmit, servers }) {
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
      title="Create Volume"
      open={visible}
      onOk={handleSubmit}
      onCancel={onCancel}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ 
          size: 10,
          format: 'ext4',
          automount: true
        }}
      >
        <Form.Item
          name="name"
          label="Volume Name"
          rules={[{ required: true, message: 'Please enter a name for the volume' }]}
        >
          <Input placeholder="My Volume" />
        </Form.Item>
        
        <Form.Item
          name="size"
          label="Size (GB)"
          rules={[{ required: true, message: 'Please specify a size for the volume' }]}
        >
          <InputNumber min={10} max={1000} style={{ width: '100%' }} />
        </Form.Item>
        
        <Form.Item
          name="location"
          label="Location"
        >
          <Select placeholder="Select a location">
            <Select.Option value="nbg1">Nuremberg, Germany</Select.Option>
            <Select.Option value="fsn1">Falkenstein, Germany</Select.Option>
            <Select.Option value="hel1">Helsinki, Finland</Select.Option>
            <Select.Option value="ash">Ashburn, VA, USA</Select.Option>
          </Select>
        </Form.Item>
        
        <Form.Item
          name="server"
          label="Attach to Server"
        >
          <Select placeholder="Select a server (optional)">
            {servers?.map(server => (
              <Select.Option key={server.id} value={server.id}>
                {server.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        
        <Form.Item
          name="format"
          label="Filesystem Format"
        >
          <Select>
            <Select.Option value="ext4">ext4</Select.Option>
            <Select.Option value="xfs">xfs</Select.Option>
          </Select>
        </Form.Item>
        
        <Form.Item
          name="automount"
          label="Automount"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default VolumeForm;