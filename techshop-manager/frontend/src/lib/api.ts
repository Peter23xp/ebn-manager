import axios, { AxiosError, AxiosInstance } from 'axios';
import { useAuthStore } from '@/store/auth.store';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token!);
  });
  failedQueue = [];
};

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 60000, // 60s pour absorber le cold start Render (free tier)
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (!navigator.onLine) {
    return Promise.reject(
      Object.assign(new Error('NETWORK_OFFLINE'), { code: 'NETWORK_OFFLINE' }),
    ) as never;
  }
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (typeof error.config) & { _retry?: boolean };

    const isNetworkError =
      !error.response ||
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNABORTED' ||
      error.code === 'ERR_CANCELED' ||
      (error as { code?: string }).code === 'NETWORK_OFFLINE';

    if (isNetworkError) {
      useAuthStore.getState().setOfflineMode(true);
      return Promise.reject(error);
    }

    if (
      error.response?.status === 401 &&
      !originalRequest?._retry &&
      originalRequest?.url !== '/auth/login' &&
      originalRequest?.url !== '/auth/refresh'
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token) => {
              if (originalRequest) {
                originalRequest.headers = originalRequest.headers ?? {};
                originalRequest.headers.Authorization = `Bearer ${token}`;
                resolve(api(originalRequest));
              }
            },
            reject,
          });
        });
      }

      if (originalRequest) originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true });
        useAuthStore.getState().setAccessToken(data.accessToken);
        processQueue(null, data.accessToken);
        if (originalRequest) {
          originalRequest.headers = originalRequest.headers ?? {};
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        useAuthStore.getState().logout();
        const publicPaths = ['/', '/login', '/portal/login', '/reset-password', '/ambassadeur'];
        if (!publicPaths.includes(window.location.pathname)) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data?.message) return Array.isArray(data.message) ? data.message[0] : data.message;
    if (data?.error?.message) return data.error.message;
    return error.message;
  }
  return 'Une erreur inattendue est survenue';
}

export const authApi = {
  login: (body: { identifier: string; password: string; rememberMe?: boolean }) =>
    api.post('/auth/login', body),
  refresh: () => api.post('/auth/refresh', {}),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  forgotPassword: (phone: string) => api.post('/auth/forgot-password', { phone }),
  verifyOtp: (phone: string, otp: string) => api.post('/auth/verify-otp', { phone, otp }),
  resetPassword: (resetToken: string, newPassword: string) =>
    api.post('/auth/reset-password', { resetToken, newPassword }),
};
