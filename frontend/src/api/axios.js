import axios from 'axios';

// Create axios instance with base URL
const instance = axios.create({
  baseURL: '/api'
});

// Add interceptor to include token in requests
instance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add interceptor to handle auth errors
instance.interceptors.response.use(
  (response) => response,
  (error) => {
    // If 401 is received, redirect to login
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default instance;