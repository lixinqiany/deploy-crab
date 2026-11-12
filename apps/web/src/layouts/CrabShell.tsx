import { Outlet, useLocation, useNavigate } from 'react-router';
import { AppLayout } from '@deploy-crab/ui/layout/AppLayout';
import {
  Sidebar,
  type SidebarItem,
} from '@deploy-crab/ui/layout/sidebar/Sidebar';
import { navRoutes } from '../routes/navigation';

const sidebarItems: SidebarItem[] = navRoutes.map(({ path, label, icon }) => ({
  key: path,
  label,
  icon,
}));

/** 当前路径属于哪个导航项，如 /projects/123 → /projects */
const findSelectedKey = (pathname: string) =>
  navRoutes.find(
    ({ path }) => pathname === path || pathname.startsWith(`${path}/`),
  )?.path;

/** 应用外壳：把 ui 的 AppLayout / Sidebar 与路由接起来 */
export const CrabShell = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <AppLayout
      sidebar={
        <Sidebar
          header={
            <div className="flex items-center gap-2 text-base font-semibold">
              <span className="text-xl">🦀</span>
              <span>Deploy Crab</span>
            </div>
          }
          items={sidebarItems}
          selectedKey={findSelectedKey(pathname)}
          onSelect={(key) => void navigate(key)}
          footer={<span className="text-xs text-slate-400">v0.0.1</span>}
        />
      }
    >
      <Outlet />
    </AppLayout>
  );
};
