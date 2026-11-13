import type { ReactNode } from 'react';
import { SvgIcon } from '@deploy-crab/ui/icon/SvgIcon';
import { DashboardView } from '../views/dashboard/DashboardView';
import ClusterSvg from '../assets/icon/cluster.svg?react';

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
    label: '集群管理',
    icon: <SvgIcon component={ClusterSvg} size="24px" />,
    element: <DashboardView />,
  },
];
