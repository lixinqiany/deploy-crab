import type { ReactNode } from 'react';
import { DashboardOutlined } from '@ant-design/icons';
import { DashboardView } from '../views/dashboard/DashboardView';

export interface NavRoute {
  /** 路由路径，同时作为侧边栏菜单项的 key */
  path: string;
  label: string;
  icon: ReactNode;
  element: ReactNode;
}

/** 侧边栏菜单和子路由都从这份配置生成 */
export const navRoutes: NavRoute[] = [
  {
    path: '/dashboard',
    label: '概览',
    icon: <DashboardOutlined />,
    element: <DashboardView />,
  },
];
