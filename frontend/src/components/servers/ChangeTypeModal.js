import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, Switch, Alert, Spin, Space, Typography, message } from 'antd';
import { UpCircleOutlined } from '@ant-design/icons';
import * as serverService from '../../api/services/serverService';

const { Option } = Select;
const { Text } = Typography;

function ChangeTypeModal({ open, onCancel, onSubmit, projectId, currentType, loading }) {
  const [form] = Form.useForm();
  const [serverTypes, setServerTypes] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && projectId) {
      fetchServerTypes();
    }
  }, [open, projectId]);

  useEffect(() => {
    if (open && currentType) {
      form.setFieldsValue({
        server_type: '',
        upgrade_disk: true
      });
    }
  }, [open, currentType, form]);

  const fetchServerTypes = async () => {
    try {
      setLoadingTypes(true);
      setError(null);
      const response = await serverService.getServerTypes(projectId);
      setServerTypes(response.server_types || []);
    } catch (err) {
      setError('Failed to load server types');
    } finally {
      setLoadingTypes(false);
    }
  };

  const handleSubmit = () => {
    form.validateFields()
      .then(values => {
        onSubmit(values.server_type, values.upgrade_disk);
      })
      .catch(info => {
        console.log('Validate Failed:', info);
      });
  };

  const compareServerTypes = (a, b) => {
    // این تابع برای مقایسه و مرتب‌سازی سرور تایپ‌ها استفاده می‌شود
    // اول براساس تعداد هسته‌ها، سپس حافظه و دیسک
    if (a.cores !== b.cores) return a.cores - b.cores;
    if (a.memory !== b.memory) return a.memory - b.memory;
    return a.disk - b.disk;
  };

  // فیلتر کردن تایپ‌های سرور و مرتب کردن آنها
  const sortedTypes = [...serverTypes].sort(compareServerTypes);
  
  // پیدا کردن سرور تایپ فعلی
  const currentServerType = serverTypes.find(type => type.name === currentType);

  // فیلتر کردن فقط تایپ‌های قابل ارتقا
  const upgradeableTypes = currentServerType ? sortedTypes.filter(type => {
    // اگر نام تایپ یکسان باشد، آن را نمایش نمی‌دهیم
    if (type.name === currentType) return false;
    
    // تایپ‌هایی که ارتقا محسوب می‌شوند
    return (
      type.cores > currentServerType.cores || 
      (type.cores === currentServerType.cores && type.memory > currentServerType.memory) ||
      (type.cores === currentServerType.cores && type.memory === currentServerType.memory && type.disk > currentServerType.disk)
    );
  }) : sortedTypes;

  return (
    <Modal
      title="Change Server Type"
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText="Change Type"
      okButtonProps={{ loading }}
    >
      <Alert
        message="Warning"
        description="Changing the server type will cause the server to restart. This may take several minutes and will cause downtime. Only upgrades are supported by Hetzner."
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
      />
      {loadingTypes ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading server types...</div>
        </div>
      ) : error ? (
        <Alert message={error} type="error" style={{ marginBottom: 16 }} />
      ) : (
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            server_type: '',
            upgrade_disk: true
          }}
        >
          {currentServerType && (
            <div style={{ marginBottom: 16 }}>
              <Text strong>Current type:</Text>{' '}
              <Text>{currentType} ({currentServerType.cores} CPU, {currentServerType.memory}GB RAM, {currentServerType.disk}GB Disk)</Text>
            </div>
          )}
          <Form.Item
            name="server_type"
            label="New Server Type"
            rules={[{ required: true, message: 'Please select a server type' }]}
          >
            <Select placeholder="Select new server type">
              {upgradeableTypes.map(type => (
                <Option key={type.name} value={type.name}>
                  <Space>
                    <UpCircleOutlined style={{ color: 'green' }} />
                    {type.name} - {type.description || `${type.cores} CPU, ${type.memory}GB RAM, ${type.disk}GB Disk`}
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="upgrade_disk"
            label="Upgrade Disk"
            valuePropName="checked"
            help="If enabled, the disk size will be upgraded if you select a larger server type."
          >
            <Switch />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}

export default ChangeTypeModal;