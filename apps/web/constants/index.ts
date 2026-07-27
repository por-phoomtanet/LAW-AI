export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4002";

export const ROUTES = {
  login: "/login",
  chat: "/",
  library: "/library",
  users: "/users",
  settings: "/settings",
} as const;
