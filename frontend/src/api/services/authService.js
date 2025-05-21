import api from '../axios';

export const login = async (username, password) => {
  // Use FormData for OAuth2 compatibility
  const formData = new FormData();
  formData.append('username', username);
  formData.append('password', password);
  
  const response = await api.post('/auth/token', formData);
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};

export const changePassword = async (oldPassword, newPassword) => {
  const response = await api.post('/auth/change-password', {
    old_password: oldPassword,
    new_password: newPassword
  });
  return response.data;
};