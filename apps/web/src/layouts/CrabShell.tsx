import { Outlet, useLocation, useNavigate } from 'react-router';
import { AppLayout } from '@deploy-crab/ui/layout/AppLayout';
import {
  Sidebar,
  type SidebarItem,
} from '@deploy-crab/ui/layout/sidebar/Sidebar';
import { SvgIcon } from '@deploy-crab/ui/icon/SvgIcon';
import { useSidebarResize } from '@deploy-crab/ui/hooks/useSidebarResize';
import { navRoutes } from '../routes/navigation';
import CrabSvg from '../assets/icon/crab.svg?react';

const sidebarItems: SidebarItem[] = navRoutes.map(({ path, label, icon }) => ({
  key: path,
  label,
  icon,
}));

/** 当前路径属于哪个导航项，如 /dashboard/123 → /dashboard */
const findSelectedKey = (pathname: string) =>
  navRoutes.find(
    ({ path }) => pathname === path || pathname.startsWith(`${path}/`),
  )?.path;

/** 应用外壳：把 ui 的 AppLayout / Sidebar 与路由接起来 */
export const CrabShell = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { width, collapsed, resizing, animating, handleProps } =
    useSidebarResize();

  return (
    <AppLayout
      sidebarWidth={width}
      resizeHandleProps={handleProps}
      resizing={resizing}
      animating={animating}
      sidebar={
        <Sidebar
          header={
            <div className="flex items-center gap-2 text-base font-semibold">
              <SvgIcon component={CrabSvg} size={30} />
              {!collapsed && (
                <span className="min-w-0 truncate font-comic text-lg font-bold tracking-wide text-[#4f3422]">
                  Deploy Crab
                </span>
              )}
            </div>
          }
          items={sidebarItems}
          selectedKey={findSelectedKey(pathname)}
          onSelect={(key) => void navigate(key)}
          footer={<span className="text-xs text-[#8d8d86]">v0.0.1</span>}
          collapsed={collapsed}
        />
      }
    >
      <Outlet />
    </AppLayout>
  );
};
