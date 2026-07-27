import AuthGuard from "@/shared/guards/AuthGuard";
import DashboardLayout from "@/shared/layouts/DashboardLayout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <DashboardLayout>{children}</DashboardLayout>
    </AuthGuard>
  );
}
