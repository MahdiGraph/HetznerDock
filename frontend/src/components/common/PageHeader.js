import React from 'react';
import { Typography, Button, Space, Breadcrumb } from 'antd';
import { Link } from 'react-router-dom';

const { Title } = Typography;

function PageHeader({ 
  title, 
  subtitle, 
  actions, 
  breadcrumb = []
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      {breadcrumb.length > 0 && (
        <Breadcrumb style={{ marginBottom: 16 }}>
          {breadcrumb.map((item, index) => (
            <Breadcrumb.Item key={index}>
              {item.path ? <Link to={item.path}>{item.name}</Link> : item.name}
            </Breadcrumb.Item>
          ))}
        </Breadcrumb>
      )}
      
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center', 
        flexWrap: 'wrap'
      }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>{title}</Title>
          {subtitle && <div style={{ color: 'rgba(0, 0, 0, 0.45)' }}>{subtitle}</div>}
        </div>
        
        {actions && (
          <Space wrap style={{ marginTop: 16 }}>
            {actions}
          </Space>
        )}
      </div>
    </div>
  );
}

export default PageHeader;