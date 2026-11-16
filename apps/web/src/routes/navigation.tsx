import type { ReactNode } from 'react';
import { SvgIcon } from '@deploy-crab/ui/icon/SvgIcon';
import { InventoryView } from '@/views/inventory/InventoryView';
import HostSvg from '@/assets/icon/host.svg?react';
import { ReadOutlined } from '@ant-design/icons';
import { TasksView } from '@/views/tasks/TasksView';

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
    path: '/clusters',
    label: '集群管理',
    icon: <SvgIcon component={HostSvg} size="24px" />,
    element: <InventoryView />,
  },
  {
    path: '/tasks',
    label: '任务库',
    icon: <ReadOutlined style={{ fontSize: 22 }} />,
    element: <TasksView />,
  },
];
