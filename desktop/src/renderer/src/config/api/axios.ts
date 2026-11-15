import axios from "axios";
import { getAuthStoreState } from "@/stores/auth";
import { isTokenExpired } from "@/lib/token";
import { environments } from "@/config/environments";

const axiosInstance = axios.create({
  baseURL: `${environments.API_URL}/`,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use((config) => {
  const authState = getAuthStoreState();

  config.headers["X-Request-Id"] = crypto.randomUUID();
  config.headers["X-Client-Route"] = `desktop-crawler${window.location.hash.replace(/^#/, "")}`;

  if (authState?.expires_in && isTokenExpired(authState.expires_in)) {
    authState.logout();
    return Promise.reject(new Error("Your sign-in has expired. Please sign in again."));
  }

  if (authState.access_token) {
    config.headers.Authorization = `Bearer ${authState.access_token}`;
  }

  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && getAuthStoreState().isLoggedIn) {
      getAuthStoreState().logout();
    }
    return Promise.reject(error);
  },
);

export default axiosInstance;
