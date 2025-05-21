import React, { useState } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Dropdown, Typography } from 'antd';
import { 
  HomeOutlined, CloudServerOutlined, CodeOutlined, 
  LogoutOutlined, UserOutlined, MenuUnfoldOutlined, 
  MenuFoldOutlined, LockOutlined, SettingOutlined,
  HistoryOutlined
} from '@ant-design/icons';

import { useAuth } from './context/AuthContext';
import ChangePasswordModal from './components/ChangePasswordModal';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Servers from './pages/Servers';
import ServerDetail from './pages/ServerDetail';
import CreateServer from './pages/CreateServer';
import Images from './pages/Images';
import ServerTypes from './pages/ServerTypes';
import Logs from './pages/Logs';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  
  // If user is not authenticated, redirect to login
  if (!isAuthenticated && location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }
  
  // User menu
  const userMenu = (
    <Menu>
      <Menu.Item key="password" onClick={() => setChangePasswordVisible(true)} icon={<LockOutlined />}>
        Change Password
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="logout" onClick={logout} icon={<LogoutOutlined />}>
        Logout
      </Menu.Item>
    </Menu>
  );
  
  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isAuthenticated ? (
        <>
          <Sider 
            trigger={null} 
            collapsible 
            collapsed={collapsed}
            width={230}
          >
            <div className="logo" style={{ 
              height: 64, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold',
              fontSize: collapsed ? 16 : 20
            }}>
              {collapsed ? 'HD' : 'HetznerDock'}
            </div>
            
            <Menu theme="dark" mode="inline" selectedKeys={[location.pathname]}>
              <Menu.Item key="/" icon={<HomeOutlined />}>
                <Link to="/">Dashboard</Link>
              </Menu.Item>
              
              <Menu.Item key="/projects" icon={<CodeOutlined />}>
                <Link to="/projects">Projects</Link>
              </Menu.Item>
              
              <Menu.SubMenu key="settings" icon={<SettingOutlined />} title="Settings">
                <Menu.Item key="/logs" icon={<HistoryOutlined />}>
                  <Link to="/logs">System Logs</Link>
                </Menu.Item>
              </Menu.SubMenu>
            </Menu>
          </Sider>
          
          <Layout>
            <Header style={{ 
              background: '#fff', 
              padding: 0, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {React.createElement(
                  collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, 
                  {
                    className: 'trigger',
                    onClick: () => setCollapsed(!collapsed),
                    style: { fontSize: 18, padding: '0 24px', cursor: 'pointer' }
                  }
                )}
                <Title level={4} style={{ margin: 0 }}>HetznerDock</Title>
              </div>
              
              <div style={{ marginRight: 24 }}>
                <Dropdown overlay={userMenu} trigger={['click']}>
                  <Button type="text" icon={<UserOutlined />}>
                    {user?.username || 'User'} 
                  </Button>
                </Dropdown>
              </div>
            </Header>
            
            <Content style={{ margin: '24px 16px', padding: 24, background: '#fff', minHeight: 280 }}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:projectId" element={<ProjectDetail />} />
                <Route path="/projects/:projectId/servers" element={<Servers />} />
                <Route path="/projects/:projectId/servers/:serverId" element={<ServerDetail />} />
                <Route path="/projects/:projectId/create-server" element={<CreateServer />} />
                <Route path="/projects/:projectId/images" element={<Images />} />
                <Route path="/projects/:projectId/server-types" element={<ServerTypes />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Content>
          </Layout>
          
          <ChangePasswordModal 
            visible={changePasswordVisible}
            onCancel={() => setChangePasswordVisible(false)}
          />
        </>
      ) : (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
    </Layout>
  );
}

export default App;