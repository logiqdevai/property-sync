import axios from 'axios'
import { getAuthStoreState } from '@/stores/auth'
import { isTokenExpired } from '@/lib/token';
import { environments } from '@/config/environments';

const axiosInstance = axios.create({
    baseURL: environments.API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

const SESSION_ID_KEY = 'activity-session-id';
let fallbackSessionId: string | null = null;

// Identifies this browser tab's session on every request so the server-side activity log can
// group actions. Falls back to a per-page-load id when sessionStorage is unavailable.
function getSessionId(): string {
    try {
        let id = window.sessionStorage.getItem(SESSION_ID_KEY);
        if (!id) {
            id = crypto.randomUUID();
            window.sessionStorage.setItem(SESSION_ID_KEY, id);
        }
        return id;
    } catch {
        fallbackSessionId ??= crypto.randomUUID();
        return fallbackSessionId;
    }
}

axiosInstance.interceptors.request.use((config) => {
    const authState = getAuthStoreState();

    config.headers['X-Request-Id'] = crypto.randomUUID();
    config.headers['X-Session-Id'] = getSessionId();
    config.headers['X-Client-Route'] = window.location.pathname;

    if (authState?.expires_in && isTokenExpired(authState.expires_in)) {
        authState.logout();

        return Promise.reject(new Error('Token expired'));
    }

    if (authState.access_token) {
        config.headers.Authorization = `Bearer ${authState.access_token}`;
    }

    return config;
});

export default axiosInstance