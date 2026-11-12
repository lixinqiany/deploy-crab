import type { ReactNode } from 'react';
import {
  CloudServerOutlined,
  DashboardOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { DashboardView } from '../views/dashboard/DashboardView';
import { ProjectsView } from '../views/projects/ProjectsView';
import { SettingsView } from '../views/settings/SettingsView';

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
  {
    path: '/projects',
    label: '项目',
    icon: <CloudServerOutlined />,
    element: <ProjectsView />,
  },
  {
    path: '/settings',
    label: '设置',
    icon: <SettingOutlined />,
    element: <SettingsView />,
  },
];
