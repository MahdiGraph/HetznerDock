import React, { createContext, useState, useEffect, useContext } from 'react';
import { message } from 'antd';
import * as authService from '../api/services/authService';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Check if user is logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          // Get current user
          const userData = await authService.getCurrentUser();
          setUser(userData);
        } catch (error) {
          console.error('Failed to get user data:', error);
          localStorage.removeItem('token');
        }
      }
      setLoading(false);
    };
    
    checkAuth();
  }, []);
  
  // Login function
  const login = async (username, password) => {
    try {
      const data = await authService.login(username, password);
      localStorage.setItem('token', data.access_token);
      
      // Get user info after login
      const userData = await authService.getCurrentUser();
      setUser(userData);
      
      return true;
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Login failed';
      message.error(errorMessage);
      return false;
    }
  };
  
  // Logout function
  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    window.location.href = '/login';
  };
  
  // Change password function
  const changePassword = async (oldPassword, newPassword) => {
    try {
      await authService.changePassword(oldPassword, newPassword);
      message.success('Password changed successfully!');
      return true;
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to change password';
      message.error(errorMessage);
      return false;
    }
  };
  
  const authContextValue = {
    user,
    loading,
    login,
    logout,
    changePassword,
    isAuthenticated: !!user
  };
  
  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);