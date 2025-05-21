import React from 'react';
import { Spin } from 'antd';

function Loading() {
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center',
      height: '100vh',
      flexDirection: 'column'
    }}>
      <h1 style={{ marginBottom: 24 }}>HetznerDock</h1>
      <Spin size="large" tip="Loading..." />
    </div>
  );
}

export default Loading;