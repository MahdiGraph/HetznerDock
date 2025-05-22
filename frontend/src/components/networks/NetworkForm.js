import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, Card, Space, Select } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import SubnetForm from './SubnetForm';

const { Option } = Select;

function NetworkForm({ visible, initialValues, onCancel, onSubmit }) {
  const [form] = Form.useForm();
  const [subnets, setSubnets] = useState([]);

  useEffect(() => {
    if (visible) {
      form.resetFields();
      if (initialValues) {
        form.setFieldsValue({
          name: initialValues.name,
          ip_range: initialValues.ip_range
        });
        setSubnets(initialValues.subnets || []);
      } else {
        setSubnets([]);
      }
    }
  }, [visible, initialValues, form]);

  const handleSubmit = () => {
    form.validateFields()
      .then(values => {
        const formData = {
          ...values,
          subnets: subnets
        };
        onSubmit(formData);
      })
      .catch(info => {
        console.log('Validate Failed:', info);
      });
  };

  const handleAddSubnet = () => {
    setSubnets([...subnets, {
      type: 'cloud',
      network_zone: 'eu-central',
      ip_range: ''
    }]);
  };

  const handleSubnetChange = (index, updatedSubnet) => {
    const updatedSubnets = [...subnets];
    updatedSubnets[index] = updatedSubnet;
    setSubnets(updatedSubnets);
  };

  const handleRemoveSubnet = (index) => {
    const updatedSubnets = [...subnets];
    updatedSubnets.splice(index, 1);
    setSubnets(updatedSubnets);
  };

  return (
    <Modal
      title={initialValues ? "Edit Network" : "Create Network"}
      open={visible}
      onCancel={onCancel}
      width={700}
      footer={[
        <Button key="back" onClick={onCancel}>
          Cancel
        </Button>,
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
          label="Network Name"
          rules={[{ required: true, message: 'Please enter a name for this network' }]}
        >
          <Input placeholder="My Network" />
        </Form.Item>
        
        <Form.Item
          name="ip_range"
          label="IP Range (CIDR Notation)"
          rules={[
            { required: true, message: 'Please enter an IP range' },
            { pattern: /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/, message: 'Please enter a valid CIDR notation (e.g., 10.0.0.0/16)' }
          ]}
        >
          <Input placeholder="10.0.0.0/16" disabled={!!initialValues} />
        </Form.Item>

        {!initialValues && (
          <div style={{ marginBottom: 16 }}>
            <h3>Subnets</h3>
            {subnets.length === 0 && (
              <p>No subnets defined. Adding subnets is optional.</p>
            )}
            
            {subnets.map((subnet, index) => (
              <Card 
                key={index} 
                style={{ marginBottom: 16 }}
                extra={
                  <Button 
                    icon={<MinusCircleOutlined />} 
                    danger
                    onClick={() => handleRemoveSubnet(index)}
                  >
                    Remove
                  </Button>
                }
              >
                <SubnetForm 
                  subnet={subnet}
                  onChange={(updatedSubnet) => handleSubnetChange(index, updatedSubnet)}
                />
              </Card>
            ))}
            
            <Button 
              type="dashed" 
              onClick={handleAddSubnet} 
              block
              icon={<PlusOutlined />}
            >
              Add Subnet
            </Button>
          </div>
        )}
      </Form>
    </Modal>
  );
}

export default NetworkForm;