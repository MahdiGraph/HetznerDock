import React, { useState } from 'react';
import { Modal, Form, Input, Select, Radio, Space, Alert, message } from 'antd';

const { Option } = Select;
const { TextArea } = Input;

function CreateImageModal({ visible, onCancel, onSubmit, loading }) {
  const [form] = Form.useForm();
  const [imageType, setImageType] = useState('snapshot');

  const handleSubmit = () => {
    form.validateFields()
      .then(values => {
        onSubmit(values);
      })
      .catch(info => {
        console.log('Validate Failed:', info);
      });
  };

  const handleTypeChange = e => {
    setImageType(e.target.value);
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
        description="Creating an image allows you to backup your server or create a template for future servers. The server will remain running during this operation."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          type: 'snapshot',
          description: '',
          labels: {}
        }}
      >
        <Form.Item
          name="type"
          label="Image Type"
        >
          <Radio.Group onChange={handleTypeChange} value={imageType}>
            <Radio value="snapshot">Snapshot (One-time backup)</Radio>
            <Radio value="backup">Backup (Managed backup)</Radio>
          </Radio.Group>
        </Form.Item>
        
        <Form.Item
          name="description"
          label="Description"
          rules={[{ required: true, message: 'Please enter a description for this image' }]}
        >
          <TextArea 
            rows={3} 
            placeholder="Enter a description to identify this image"
          />
        </Form.Item>
        
        {imageType === 'backup' && (
          <Alert
            message="Backup Information"
            description="Backups are managed by Hetzner and can be automatically rotated. They may incur additional costs depending on your plan."
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
      </Form>
    </Modal>
  );
}

export default CreateImageModal;