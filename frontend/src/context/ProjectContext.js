import React, { createContext, useState, useEffect, useContext } from 'react';
import { message } from 'antd';
import * as projectService from '../api/services/projectService';
import { useAuth } from './AuthContext';

const ProjectContext = createContext();

export const ProjectProvider = ({ children }) => {
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated } = useAuth();
  
  useEffect(() => {
    if (isAuthenticated) {
      fetchProjects();
    }
  }, [isAuthenticated]);
  
  const fetchProjects = async () => {
    if (!isAuthenticated) return;
    
    try {
      setLoading(true);
      const projectsData = await projectService.getProjects();
      setProjects(projectsData);
      
      // Set current project to first project if none is selected
      if (projectsData.length > 0 && !currentProject) {
        setCurrentProject(projectsData[0]);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      message.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };
  
  const addProject = async (projectData) => {
    try {
      const newProject = await projectService.createProject(projectData);
      setProjects([...projects, newProject]);
      message.success(`Project ${newProject.name} created successfully`);
      return newProject;
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to create project';
      message.error(errorMessage);
      throw error;
    }
  };
  
  const updateProject = async (projectId, projectData) => {
    try {
      const updatedProject = await projectService.updateProject(projectId, projectData);
      setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
      
      // Update current project if it's the one being updated
      if (currentProject?.id === projectId) {
        setCurrentProject(updatedProject);
      }
      
      message.success(`Project ${updatedProject.name} updated successfully`);
      return updatedProject;
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to update project';
      message.error(errorMessage);
      throw error;
    }
  };
  
  const deleteProject = async (projectId) => {
    try {
      await projectService.deleteProject(projectId);
      
      const updatedProjects = projects.filter(p => p.id !== projectId);
      setProjects(updatedProjects);
      
      // If the deleted project was the current one, set the first available project or null
      if (currentProject?.id === projectId) {
        setCurrentProject(updatedProjects.length > 0 ? updatedProjects[0] : null);
      }
      
      message.success('Project deleted successfully');
      return true;
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to delete project';
      message.error(errorMessage);
      throw error;
    }
  };
  
  const selectProject = (project) => {
    setCurrentProject(project);
    localStorage.setItem('lastProjectId', project.id);
  };
  
  // Context value
  const contextValue = {
    projects,
    currentProject,
    loading,
    fetchProjects,
    addProject,
    updateProject,
    deleteProject,
    selectProject
  };
  
  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjects = () => useContext(ProjectContext);