import React from 'react';
import { Layout, Button, Dropdown, Typography, Space } from 'antd';
import { 
  MenuUnfoldOutlined, 
  MenuFoldOutlined, 
  UserOutlined,
  LogoutOutlined,
  LockOutlined
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { useProjects } from '../../context/ProjectContext';
import ProjectSelector from '../projects/ProjectSelector';

const { Header: AntHeader } = Layout;
const { Title } = Typography;

function Header({ collapsed, setCollapsed, showChangePassword }) {
  const { user, logout } = useAuth();
  const { projects, currentProject, selectProject } = useProjects();
  
  const userMenu = (
    <Dropdown.Menu>
      <Dropdown.Item key="password" onClick={showChangePassword} icon={<LockOutlined />}>
        Change Password
      </Dropdown.Item>
      <Dropdown.Divider />
      <Dropdown.Item key="logout" onClick={logout} icon={<LogoutOutlined />}>
        Logout
      </Dropdown.Item>
    </Dropdown.Menu>
  );
  
  return (
    <AntHeader style={{ 
      padding: 0, 
      background: '#fff', 
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between'
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={() => setCollapsed(!collapsed)}
          style={{
            fontSize: '16px',
            width: 64,
            height: 64,
          }}
        />
        <Title level={4} style={{ margin: 0 }}>HetznerDock</Title>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', marginRight: 24 }}>
        <Space>
          {projects.length > 0 && (
            <ProjectSelector 
              projects={projects} 
              currentProject={currentProject} 
              onChange={selectProject} 
            />
          )}
          
          <Dropdown overlay={userMenu} trigger={['click']}>
            <Button type="text" icon={<UserOutlined />}>
              {user?.username || 'User'} 
            </Button>
          </Dropdown>
        </Space>
      </div>
    </AntHeader>
  );
}

export default Header;