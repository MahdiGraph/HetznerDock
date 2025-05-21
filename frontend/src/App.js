import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import MainLayout from './components/layout/MainLayout';

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

// Loading
import Loading from './components/common/Loading';

function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <Loading />;
  }

  return (
    <Routes>
      <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />
      
      <Route element={<MainLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:projectId" element={<ProjectDetail />} />
        <Route path="/projects/:projectId/servers" element={<Servers />} />
        <Route path="/projects/:projectId/servers/:serverId" element={<ServerDetail />} />
        <Route path="/projects/:projectId/create-server" element={<CreateServer />} />
        <Route path="/projects/:projectId/images" element={<Images />} />
        <Route path="/projects/:projectId/server-types" element={<ServerTypes />} />
        <Route path="/logs" element={<Logs />} />
      </Route>
      
      <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} />} />
    </Routes>
  );
}

export default App;