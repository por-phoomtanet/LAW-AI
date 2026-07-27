import PermissionGuard from "@/shared/guards/PermissionGuard";
import UsersPageContent from "@/modules/users/components/UsersPageContent";

export default function UsersPage() {
  return (
    <PermissionGuard menuKey="users">
      <UsersPageContent />
    </PermissionGuard>
  );
}
