import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type { LoggedInUser } from "@/features/user/interfaces/user.interface";
import { Routes } from "@/routes/routes";

interface AuthStore extends LoggedInUser {
  login(user: LoggedInUser): void;
  logout(): void;
}

const initialValues: LoggedInUser = {
  isLoggedIn: false,
  user_uuid: null,
  role: null,
  full_name: "",
  email: null,
  access_token: null,
  expires_in: null,
};

const STORE_KEY = "auth";

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set) => ({
        ...initialValues,
        login: (user: LoggedInUser) => set((state) => ({ ...state, ...user })),
        logout: () => {
          set(initialValues);
          localStorage.removeItem(STORE_KEY);
          window.location.hash = Routes.auth.sign_in;
        },
      }),
      { name: STORE_KEY },
    ),
  ),
);

export const getAuthStoreState = () => useAuthStore.getState();
