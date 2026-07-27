import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RolePermission {
  menuKey: string;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

interface PermissionState {
  permissions: RolePermission[];
  setPermissions: (permissions: RolePermission[]) => void;
  clearPermissions: () => void;
  canView: (menuKey: string) => boolean;
  canCreate: (menuKey: string) => boolean;
  canUpdate: (menuKey: string) => boolean;
  canDelete: (menuKey: string) => boolean;
}

export const usePermissionStore = create<PermissionState>()(
  persist(
    (set, get) => ({
      permissions: [],
      setPermissions: (permissions) => set({ permissions }),
      clearPermissions: () => set({ permissions: [] }),
      canView: (menuKey) => get().permissions.find((p) => p.menuKey === menuKey)?.canView ?? false,
      canCreate: (menuKey) =>
        get().permissions.find((p) => p.menuKey === menuKey)?.canCreate ?? false,
      canUpdate: (menuKey) =>
        get().permissions.find((p) => p.menuKey === menuKey)?.canUpdate ?? false,
      canDelete: (menuKey) =>
        get().permissions.find((p) => p.menuKey === menuKey)?.canDelete ?? false,
    }),
    { name: "permission-storage" },
  ),
);
