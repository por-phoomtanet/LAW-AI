import PermissionGuard from "@/shared/guards/PermissionGuard";
import SettingsPageContent from "@/modules/settings/components/SettingsPageContent";

export default function SettingsPage() {
  return (
    <PermissionGuard menuKey="settings">
      <SettingsPageContent />
    </PermissionGuard>
  );
}
