import api from '../axios';

export const getSnapshots = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/images?type=snapshot`);
  return response.data;
};

export const deleteSnapshot = async (projectId, snapshotId) => {
  const response = await api.delete(`/projects/${projectId}/images/${snapshotId}`);
  return response.data;
};

export const createServerFromSnapshot = async (projectId, snapshotId, serverData) => {
  const response = await api.post(`/projects/${projectId}/servers`, {
    ...serverData,
    image: snapshotId
  });
  return response.data;
};