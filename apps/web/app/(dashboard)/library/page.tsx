import PermissionGuard from "@/shared/guards/PermissionGuard";
import LibraryPageContent from "@/modules/library/components/LibraryPageContent";

export default function LibraryPage() {
  return (
    <PermissionGuard menuKey="library">
      <LibraryPageContent />
    </PermissionGuard>
  );
}
