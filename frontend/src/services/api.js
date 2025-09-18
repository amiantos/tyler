import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

export const containerService = {
  // Primary container methods
  getPrimary: () => api.get('/containers/primary'),
  createPrimary: (password, size) => api.post('/containers/primary/create', { password, size }),
  mountPrimary: (password) => api.post('/containers/primary/mount', { password }),
  unmountPrimary: () => api.post('/containers/primary/unmount'),
  startPrimary: () => api.post('/containers/primary/start'),
  stopPrimary: () => api.post('/containers/primary/stop'),
  verifyPrimaryPassword: (password) => api.post('/containers/primary/verify-password', { password }),
  deletePrimary: (password) => api.delete('/containers/primary', { data: { password } }),
  getSillyTavernStatus: () => api.get('/containers/primary/sillytavern-status'),
};

export default api;