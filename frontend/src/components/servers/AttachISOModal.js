import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, Alert, Spin, Input, message } from 'antd';
import * as serverService from '../../api/services/serverService';

const { Search } = Input;

function AttachISOModal({ open, onCancel, onSubmit, projectId }) {
  const [form] = Form.useForm();
  const [isos, setISOs] = useState([]);
  const [filteredISOs, setFilteredISOs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    if (open && projectId) {
      fetchISOs();
    }
  }, [open, projectId]);

  useEffect(() => {
    if (searchText) {
      const filtered = isos.filter(iso => 
        iso.name.toLowerCase().includes(searchText.toLowerCase()) ||
        (iso.description && iso.description.toLowerCase().includes(searchText.toLowerCase()))
      );
      setFilteredISOs(filtered);
    } else {
      setFilteredISOs(isos);
    }
  }, [searchText, isos]);

  const fetchISOs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await serverService.getISOs(projectId);
      setISOs(response.isos || []);
      setFilteredISOs(response.isos || []);
    } catch (err) {
      setError('Failed to load ISOs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      onSubmit(values.iso);
    } catch (err) {
      console.error('Validation failed:', err);
    }
  };

  const handleSearch = value => {
    setSearchText(value);
  };

  return (
    <Modal
      title="Attach ISO"
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText="Attach"
      confirmLoading={loading}
    >
      <Alert
        message="ISO Images"
        description="Attaching an ISO to your server will make it available as a virtual CD-ROM. This can be used for installation, rescue operations, or other purposes."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Spin />
          <p>Loading ISO images...</p>
        </div>
      ) : error ? (
        <Alert message={error} type="error" />
      ) : (
        <Form form={form} layout="vertical">
          <Search
            placeholder="Search ISO images"
            onChange={e => handleSearch(e.target.value)}
            style={{ marginBottom: 16 }}
          />
          
          <Form.Item
            name="iso"
            label="Select ISO Image"
            rules={[{ required: true, message: 'Please select an ISO image' }]}
          >
            <Select 
              placeholder="Select an ISO image"
              showSearch
              filterOption={false}
              style={{ width: '100%' }}
            >
              {filteredISOs.map(iso => (
                <Select.Option key={iso.id} value={iso.name}>
                  {iso.description || iso.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}

export default AttachISOModal;
