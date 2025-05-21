import React, { useState, useEffect } from 'react';
import { Layout } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';
import Header from './Header';
import ChangePasswordModal from '../auth/ChangePasswordModal';

const { Content } = Layout;

function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);
  
  // Handle sidebar collapse on mobile devices
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setCollapsed(true);
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize();
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  if (!isAuthenticated) {
    return null;
  }
  
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sidebar 
        collapsed={collapsed} 
        location={location}
      />
      
      <Layout>
        <Header 
          collapsed={collapsed} 
          setCollapsed={setCollapsed}
          showChangePassword={() => setChangePasswordVisible(true)}
        />
        
        <Content style={{ margin: '24px 16px', overflow: 'initial' }}>
          <div style={{ 
            padding: 24, 
            background: '#fff', 
            borderRadius: 4,
            minHeight: 'calc(100vh - 112px)' 
          }}>
            <Outlet />
          </div>
        </Content>
      </Layout>
      
      <ChangePasswordModal 
        visible={changePasswordVisible}
        onCancel={() => setChangePasswordVisible(false)}
      />
    </Layout>
  );
}

export default MainLayout;