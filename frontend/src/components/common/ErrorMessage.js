import React from 'react';
import { Alert, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

function ErrorMessage({ message, retry }) {
  return (
    <Alert
      message="Error"
      description={
        <div>
          <p>{message || "An error occurred."}</p>
          {retry && (
            <Button 
              type="primary" 
              icon={<ReloadOutlined />} 
              onClick={retry}
              size="small"
            >
              Retry
            </Button>
          )}
        </div>
      }
      type="error"
      showIcon
    />
  );
}

export default ErrorMessage;