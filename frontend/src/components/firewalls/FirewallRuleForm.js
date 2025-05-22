import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Radio, Space, Button } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';

const { Option } = Select;

function FirewallRuleForm({ rule, onChange }) {
  const [localRule, setLocalRule] = useState(rule);

  useEffect(() => {
    // Update parent component when local rule changes
    onChange(localRule);
  }, [localRule, onChange]);

  const handleChange = (field, value) => {
    const updatedRule = { ...localRule, [field]: value };
    setLocalRule(updatedRule);
  };

  const handleIPsChange = (field, ips) => {
    const updatedRule = { ...localRule, [field]: ips };
    setLocalRule(updatedRule);
  };

  const handleAddIP = (field) => {
    const ips = localRule[field] || [];
    handleIPsChange(field, [...ips, '']);
  };

  const handleRemoveIP = (field, index) => {
    const ips = [...(localRule[field] || [])];
    ips.splice(index, 1);
    handleIPsChange(field, ips);
  };

  const handleIPChange = (field, index, value) => {
    const ips = [...(localRule[field] || [])];
    ips[index] = value;
    handleIPsChange(field, ips);
  };

  return (
    <div>
      <Form layout="vertical">
        <Form.Item label="Direction">
          <Radio.Group 
            value={localRule.direction} 
            onChange={e => handleChange('direction', e.target.value)}
          >
            <Radio value="in">Inbound</Radio>
            <Radio value="out">Outbound</Radio>
          </Radio.Group>
        </Form.Item>
        
        <Form.Item label="Protocol">
          <Select
            value={localRule.protocol}
            onChange={value => handleChange('protocol', value)}
            style={{ width: 120 }}
          >
            <Option value="tcp">TCP</Option>
            <Option value="udp">UDP</Option>
            <Option value="icmp">ICMP</Option>
          </Select>
        </Form.Item>
        
        {(localRule.protocol === 'tcp' || localRule.protocol === 'udp') && (
          <Form.Item label="Port">
            <Input 
              placeholder="Port or port range (e.g., 80 or 8000-9000)" 
              value={localRule.port}
              onChange={e => handleChange('port', e.target.value)}
            />
          </Form.Item>
        )}
        
        {localRule.direction === 'in' && (
          <Form.Item label="Source IPs">
            {(localRule.source_ips || []).map((ip, index) => (
              <Space key={index} style={{ display: 'flex', marginBottom: 8 }}>
                <Input 
                  placeholder="IP or CIDR (e.g., 1.2.3.4 or 10.0.0.0/24)" 
                  value={ip}
                  onChange={e => handleIPChange('source_ips', index, e.target.value)}
                />
                <Button 
                  danger 
                  icon={<MinusCircleOutlined />} 
                  onClick={() => handleRemoveIP('source_ips', index)}
                />
              </Space>
            ))}
            <Button 
              type="dashed" 
              onClick={() => handleAddIP('source_ips')} 
              icon={<PlusOutlined />}
            >
              Add Source IP
            </Button>
          </Form.Item>
        )}
        
        {localRule.direction === 'out' && (
          <Form.Item label="Destination IPs">
            {(localRule.destination_ips || []).map((ip, index) => (
              <Space key={index} style={{ display: 'flex', marginBottom: 8 }}>
                <Input 
                  placeholder="IP or CIDR (e.g., 1.2.3.4 or 10.0.0.0/24)" 
                  value={ip}
                  onChange={e => handleIPChange('destination_ips', index, e.target.value)}
                />
                <Button 
                  danger 
                  icon={<MinusCircleOutlined />} 
                  onClick={() => handleRemoveIP('destination_ips', index)}
                />
              </Space>
            ))}
            <Button 
              type="dashed" 
              onClick={() => handleAddIP('destination_ips')} 
              icon={<PlusOutlined />}
            >
              Add Destination IP
            </Button>
          </Form.Item>
        )}
        
        <Form.Item label="Description">
          <Input 
            placeholder="Optional description" 
            value={localRule.description}
            onChange={e => handleChange('description', e.target.value)}
          />
        </Form.Item>
      </Form>
    </div>
  );
}

export default FirewallRuleForm;