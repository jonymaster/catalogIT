import axios from "axios";
import { createCachingAdapter } from "./responseCache";

// Same-origin (path proxy) when unset; split hostnames (e.g. ECS) set VITE_API_BASE_URL at build time.
const apiBase =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

// Large lists loaded by several pages (dashboard, services, costs, calendar).
const CACHEABLE_LIST = /^\/?api\/(services|hardware|dashboard)\/$/;

export const responseCache = createCachingAdapter(axios.getAdapter(axios.defaults.adapter), {
  ttlMs: 30_000,
  isCacheable: (url) => CACHEABLE_LIST.test(url),
});

const client = axios.create({
  baseURL: apiBase || "/",
  adapter: responseCache,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("catalogit_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function isAuthPath(): boolean {
  const p = window.location.pathname;
  return p === "/login" || p.startsWith("/sso/");
}

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isAuthPath()) {
      localStorage.removeItem("catalogit_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default client;
