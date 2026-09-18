import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios, { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { api } from './api';
import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@/types';

const originalAdapter = api.defaults.adapter;
const originalRefreshAdapter = axios.defaults.adapter;
const location = { pathname: '/dashboard', href: '/dashboard', replace: vi.fn() };

function response(config: InternalAxiosRequestConfig, data: unknown): AxiosResponse {
  return { config, data, status: 200, statusText: 'OK', headers: {} };
}

function unauthorized(config: InternalAxiosRequestConfig) {
  return new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, { ...response(config, {}), status: 401 });
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function authenticate(role: Role = 'AGENT', token = 'old-token') {
  useAuthStore.getState().setAuth({ id: token, name: 'Compte test', role }, token);
}

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  location.pathname = '/dashboard';
  location.href = '/dashboard';
  location.replace.mockReset();
  vi.stubGlobal('window', { location });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  axios.defaults.adapter = originalRefreshAdapter;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Expiration de session et réponses tardives', () => {
  it.each<[Role, string]>([['AGENT', '/dashboard'], ['CLIENT', '/portal/home']])('renvoie %s à l’accueil si le renouvellement échoue', async (role, path) => {
    authenticate(role);
    location.pathname = path;
    api.defaults.adapter = async config => { throw unauthorized(config); };
    axios.defaults.adapter = async config => { throw unauthorized(config); };
    await expect(api.get('/protected')).rejects.toBeInstanceOf(AxiosError);
    expect(location.replace).toHaveBeenCalledExactlyOnceWith('/');
    expect(useAuthStore.getState()).toMatchObject({ user: null, accessToken: null, isAuthenticated: false });
    expect(localStorage.getItem('ebn_auth_v1')).toBeNull();
  });

  it('renouvelle une session valide et rejoue la requête sans déconnecter', async () => {
    authenticate();
    const refresh = vi.fn<AxiosAdapter>(async config => response(config, { accessToken: 'renewed-token' }));
    axios.defaults.adapter = refresh;
    api.defaults.adapter = async config => {
      if (config.headers.Authorization !== 'Bearer renewed-token') throw unauthorized(config);
      return response(config, { ok: true });
    };
    expect((await api.get('/protected')).data).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, accessToken: 'renewed-token' });
    expect(location.replace).not.toHaveBeenCalled();
  });

  it('partage un renouvellement entre deux requêtes de la même session', async () => {
    authenticate();
    const pending = deferred<AxiosResponse>();
    const refresh = vi.fn<AxiosAdapter>(() => pending.promise);
    axios.defaults.adapter = refresh;
    const requests = vi.fn<AxiosAdapter>(async config => {
      if (config.headers.Authorization !== 'Bearer renewed-token') throw unauthorized(config);
      return response(config, config.url);
    });
    api.defaults.adapter = requests;
    const first = api.get('/first');
    const second = api.get('/second');
    await vi.waitFor(() => expect(requests).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    pending.resolve(response(refresh.mock.calls[0][0], { accessToken: 'renewed-token' }));
    expect((await Promise.all([first, second])).map(result => result.data)).toEqual(['/first', '/second']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(location.replace).not.toHaveBeenCalled();
  });

  it('rejoue un 401 retardé avec le token déjà renouvelé de la même session', async () => {
    authenticate();
    const pending = deferred<AxiosResponse>();
    const refresh = vi.fn<AxiosAdapter>(async config => response(config, { accessToken: 'renewed-token' }));
    axios.defaults.adapter = refresh;
    const requests = vi.fn<AxiosAdapter>(async config => {
      if (config.headers.Authorization === 'Bearer renewed-token') return response(config, config.url);
      if (config.url === '/slow') return pending.promise;
      throw unauthorized(config);
    });
    api.defaults.adapter = requests;
    const slow = api.get('/slow');
    expect((await api.get('/fast')).data).toBe('/fast');
    pending.reject(unauthorized(requests.mock.calls[0][0]));
    expect((await slow).data).toBe('/slow');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(location.replace).not.toHaveBeenCalled();
  });

  it.each([false, true])('conserve le renouvellement après une modification du profil (succès : %s)', async success => {
    authenticate();
    const pending = deferred<AxiosResponse>();
    const refresh = vi.fn<AxiosAdapter>(() => pending.promise);
    axios.defaults.adapter = refresh;
    api.defaults.adapter = async config => {
      if (config.headers.Authorization !== 'Bearer renewed-token') throw unauthorized(config);
      return response(config, { ok: true });
    };
    const result = api.get('/protected').catch(error => error);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const session = useAuthStore.getState();
    session.setAuth({ ...session.user!, name: 'Nom modifié' }, session.accessToken!);
    if (success) pending.resolve(response(refresh.mock.calls[0][0], { accessToken: 'renewed-token' }));
    else pending.reject(unauthorized(refresh.mock.calls[0][0]));
    const settled = await result;
    if (success) {
      expect(settled.data).toEqual({ ok: true });
      expect(useAuthStore.getState().user?.name).toBe('Nom modifié');
      expect(useAuthStore.getState().accessToken).toBe('renewed-token');
      expect(location.replace).not.toHaveBeenCalled();
    } else {
      expect(settled).toBeInstanceOf(AxiosError);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(location.replace).toHaveBeenCalledExactlyOnceWith('/');
    }
  });

  it('ne rejoue pas un ancien 401 après reconnexion au même compte avec le même token', async () => {
    authenticate();
    const pending = deferred<AxiosResponse>();
    const requests = vi.fn<AxiosAdapter>(() => pending.promise);
    api.defaults.adapter = requests;
    const refresh = vi.fn<AxiosAdapter>(async config => { throw unauthorized(config); });
    axios.defaults.adapter = refresh;
    const result = api.get('/protected').catch(error => error);
    await vi.waitFor(() => expect(requests).toHaveBeenCalledTimes(1));
    useAuthStore.getState().logout();
    authenticate();
    pending.reject(unauthorized(requests.mock.calls[0][0]));
    await result;
    expect(refresh).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(location.replace).not.toHaveBeenCalled();
  });

  it('renouvelle la nouvelle session sans attendre le renouvellement de l’ancienne', async () => {
    authenticate();
    const pending = deferred<AxiosResponse>();
    const refresh = vi.fn<AxiosAdapter>()
      .mockImplementationOnce(() => pending.promise)
      .mockImplementation(async config => response(config, { accessToken: 'renewed-new-session' }));
    axios.defaults.adapter = refresh;
    const requests = vi.fn<AxiosAdapter>(async config => {
      if (config.headers.Authorization !== 'Bearer renewed-new-session') throw unauthorized(config);
      return response(config, { ok: true });
    });
    api.defaults.adapter = requests;
    const previous = api.get('/previous').catch(error => error);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    useAuthStore.getState().logout();
    authenticate('CLIENT', 'new-session');
    const current = api.get('/current').catch(error => error);
    await vi.waitFor(() => expect(requests).toHaveBeenCalledWith(expect.objectContaining({ url: '/current' })));
    pending.reject(unauthorized(refresh.mock.calls[0][0]));
    await previous;
    expect((await current).data).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().accessToken).toBe('renewed-new-session');
    expect(location.replace).not.toHaveBeenCalled();
  });

  it.each([false, true])('ignore un ancien 401 après déconnexion (nouveau compte : %s)', async newAccount => {
    authenticate();
    const pending = deferred<AxiosResponse>();
    const requests = vi.fn<AxiosAdapter>(() => pending.promise);
    api.defaults.adapter = requests;
    const refresh = vi.fn<AxiosAdapter>(async config => response(config, { accessToken: 'stale-token' }));
    axios.defaults.adapter = refresh;
    const result = api.get('/protected').catch(error => error);
    await vi.waitFor(() => expect(requests).toHaveBeenCalledTimes(1));
    useAuthStore.getState().logout();
    if (newAccount) authenticate('CLIENT', 'new-session');
    pending.reject(unauthorized(requests.mock.calls[0][0]));
    await result;
    expect(refresh).not.toHaveBeenCalled();
    expect(useAuthStore.getState().accessToken).toBe(newAccount ? 'new-session' : null);
    expect(location.replace).not.toHaveBeenCalled();
  });

  it.each([
    [false, false], [false, true], [true, false], [true, true],
  ])('ignore un renouvellement tardif après déconnexion (succès : %s, nouveau compte : %s)', async (success, newAccount) => {
    authenticate();
    const pending = deferred<AxiosResponse>();
    const refresh = vi.fn<AxiosAdapter>(() => pending.promise);
    axios.defaults.adapter = refresh;
    const requests = vi.fn<AxiosAdapter>(async config => { throw unauthorized(config); });
    api.defaults.adapter = requests;
    const result = api.get('/protected').catch(error => error);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    useAuthStore.getState().logout();
    if (newAccount) authenticate('CLIENT', 'new-session');
    if (success) pending.resolve(response(refresh.mock.calls[0][0], { accessToken: 'stale-token' }));
    else pending.reject(unauthorized(refresh.mock.calls[0][0]));
    await result;
    expect(requests).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: newAccount, accessToken: newAccount ? 'new-session' : null });
    expect(localStorage.getItem('ebn_auth_v1')).toBe(newAccount ? JSON.stringify({ user: useAuthStore.getState().user, accessToken: 'new-session' }) : null);
    expect(location.replace).not.toHaveBeenCalled();
  });

  it.each(['/auth/login', '/portal/auth/login'])('ne traite pas une erreur de connexion %s comme une session expirée', async path => {
    api.defaults.adapter = async config => { throw unauthorized(config); };
    const refresh = vi.fn<AxiosAdapter>(async config => response(config, { accessToken: 'unexpected-token' }));
    axios.defaults.adapter = refresh;
    await expect(api.post(path, {})).rejects.toBeInstanceOf(AxiosError);
    expect(refresh).not.toHaveBeenCalled();
    expect(location.replace).not.toHaveBeenCalled();
  });
});
