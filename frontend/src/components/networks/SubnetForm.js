import React, { useState, useEffect } from 'react';
import { Form, Input, Select } from 'antd';

const { Option } = Select;

function SubnetForm({ subnet, onChange }) {
  const [localSubnet, setLocalSubnet] = useState(subnet);

  useEffect(() => {
    // Update parent component when local subnet changes
    onChange(localSubnet);
  }, [localSubnet, onChange]);

  const handleChange = (field, value) => {
    const updatedSubnet = { ...localSubnet, [field]: value };
    setLocalSubnet(updatedSubnet);
  };

  return (
    <div>
      <Form layout="vertical">
        <Form.Item label="Type">
          <Select
            value={localSubnet.type}
            onChange={value => handleChange('type', value)}
            style={{ width: '100%' }}
          >
            <Option value="cloud">Cloud</Option>
            <Option value="server">Server</Option>
          </Select>
        </Form.Item>
        
        <Form.Item label="Network Zone">
          <Select
            value={localSubnet.network_zone}
            onChange={value => handleChange('network_zone', value)}
            style={{ width: '100%' }}
          >
            <Option value="eu-central">EU Central (Germany)</Option>
            <Option value="us-east">US East</Option>
            <Option value="us-west">US West</Option>
          </Select>
        </Form.Item>
        
        <Form.Item label="IP Range (CIDR Notation)">
          <Input 
            placeholder="10.0.1.0/24" 
            value={localSubnet.ip_range}
            onChange={e => handleChange('ip_range', e.target.value)}
          />
        </Form.Item>
      </Form>
    </div>
  );
}

export default SubnetForm;