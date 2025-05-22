import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, Card, Space } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import FirewallRuleForm from './FirewallRuleForm';

function FirewallForm({ visible, initialValues, onCancel, onSubmit }) {
  const [form] = Form.useForm();
  const [rules, setRules] = useState([]);

  useEffect(() => {
    if (visible) {
      form.resetFields();
      if (initialValues) {
        form.setFieldsValue({
          name: initialValues.name
        });
        setRules(initialValues.rules || []);
      } else {
        setRules([]);
      }
    }
  }, [visible, initialValues, form]);

  const handleSubmit = () => {
    form.validateFields()
      .then(values => {
        const formData = {
          ...values,
          rules: rules
        };
        onSubmit(formData);
      })
      .catch(info => {
        console.log('Validate Failed:', info);
      });
  };

  const handleAddRule = () => {
    setRules([...rules, {
      direction: 'in',
      protocol: 'tcp',
      source_ips: [],
      port: ''
    }]);
  };

  const handleRuleChange = (index, updatedRule) => {
    const updatedRules = [...rules];
    updatedRules[index] = updatedRule;
    setRules(updatedRules);
  };

  const handleRemoveRule = (index) => {
    const updatedRules = [...rules];
    updatedRules.splice(index, 1);
    setRules(updatedRules);
  };

  return (
    <Modal
      title={initialValues ? "Edit Firewall" : "Create Firewall"}
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
          label="Firewall Name"
          rules={[{ required: true, message: 'Please enter a name for this firewall' }]}
        >
          <Input placeholder="My Firewall" />
        </Form.Item>

        <div style={{ marginBottom: 16 }}>
          <h3>Firewall Rules</h3>
          {rules.length === 0 && (
            <p>No rules defined. Add a rule to specify which traffic is allowed.</p>
          )}
          
          {rules.map((rule, index) => (
            <Card 
              key={index} 
              style={{ marginBottom: 16 }}
              extra={
                <Button 
                  icon={<MinusCircleOutlined />} 
                  danger
                  onClick={() => handleRemoveRule(index)}
                >
                  Remove
                </Button>
              }
            >
              <FirewallRuleForm 
                rule={rule}
                onChange={(updatedRule) => handleRuleChange(index, updatedRule)}
              />
            </Card>
          ))}
          
          <Button 
            type="dashed" 
            onClick={handleAddRule} 
            block
            icon={<PlusOutlined />}
          >
            Add Rule
          </Button>
        </div>
      </Form>
    </Modal>
  );
}

export default FirewallForm;