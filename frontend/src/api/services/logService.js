import api from '../axios';

export const getLogs = async (projectId, params) => {
  const response = await api.get(`/projects/${projectId}/logs`, { params });
  return response.data;
};