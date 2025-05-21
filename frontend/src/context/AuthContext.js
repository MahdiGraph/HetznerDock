import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from '../api/axios';
import { message } from 'antd';

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
          const response = await axios.get('/auth/me');
          setUser(response.data);
        } catch (error) {
          // If token is invalid, remove it
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
      // Use FormData for OAuth2 compatibility
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);
      
      const response = await axios.post('/auth/token', formData);
      localStorage.setItem('token', response.data.access_token);
      
      // Get user info after login
      const userResponse = await axios.get('/auth/me');
      setUser(userResponse.data);
      
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
  };
  
  // Change password function
  const changePassword = async (oldPassword, newPassword) => {
    try {
      await axios.post('/auth/change-password', {
        old_password: oldPassword,
        new_password: newPassword
      });
      
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