import axios, { AxiosError, AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/auth.store';
import { MOBILE_MONEY_UNAVAILABLE_MESSAGE } from './mobile-money';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

type SessionRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _sessionVersion?: number;
};

let pendingRefresh: { sessionVersion: number; promise: Promise<string> } | null = null;

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
  const session = useAuthStore.getState();
  const request = config as SessionRequestConfig;
  if (request._sessionVersion !== undefined && request._sessionVersion !== session.sessionVersion) {
    throw new axios.CanceledError('Session terminée');
  }
  request._sessionVersion = session.sessionVersion;
  if (session.accessToken) config.headers.Authorization = `Bearer ${session.accessToken}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as SessionRequestConfig | undefined;

    if (axios.isCancel(error)) return Promise.reject(error);

    const isNetworkError =
      !error.response ||
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNABORTED' ||
      (error as { code?: string }).code === 'NETWORK_OFFLINE';

    if (isNetworkError) {
      useAuthStore.getState().setOfflineMode(true);
      return Promise.reject(error);
    }

    if (
      error.response?.status === 401 &&
      !originalRequest?._retry &&
      originalRequest?.url !== '/auth/login' &&
      originalRequest?.url !== '/portal/auth/login' &&
      originalRequest?.url !== '/auth/refresh'
    ) {
      const session = useAuthStore.getState();
      if (
        !session.isAuthenticated || !originalRequest ||
        originalRequest._sessionVersion !== session.sessionVersion
      ) {
        return Promise.reject(error);
      }
      const isCurrentSession = () => {
        const current = useAuthStore.getState();
        return current.isAuthenticated && current.sessionVersion === session.sessionVersion;
      };

      originalRequest._retry = true;
      if (originalRequest.headers.Authorization !== `Bearer ${session.accessToken}`) {
        return api(originalRequest);
      }

      if (!pendingRefresh || pendingRefresh.sessionVersion !== session.sessionVersion) {
        const refresh: Promise<string> = axios.post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
          .then(({ data }) => {
            if (!isCurrentSession()) throw new axios.CanceledError('Session terminée');
            useAuthStore.getState().setAccessToken(data.accessToken);
            return data.accessToken;
          })
          .catch(refreshError => {
            if (isCurrentSession()) {
              useAuthStore.getState().logout();
              if (window.location.pathname !== '/') window.location.replace('/');
            }
            throw refreshError;
          })
          .finally(() => {
            if (pendingRefresh?.promise === refresh) pendingRefresh = null;
          });
        pendingRefresh = { sessionVersion: session.sessionVersion, promise: refresh };
      }

      const token = await pendingRefresh.promise;
      if (!isCurrentSession()) throw new axios.CanceledError('Session terminée');
      originalRequest.headers.Authorization = `Bearer ${token}`;
      return api(originalRequest);
    }

    return Promise.reject(error);
  },
);

export function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'MOBILE_MONEY_UNAVAILABLE') {
    return MOBILE_MONEY_UNAVAILABLE_MESSAGE;
  }
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
