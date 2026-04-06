import axios from "axios";

// Same-origin (path proxy) when unset; split hostnames (e.g. ECS) set VITE_API_BASE_URL at build time.
const apiBase =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

const client = axios.create({
  baseURL: apiBase || "/",
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("catalogit_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("catalogit_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default client;
