import type { ReactNode } from 'react';
import { Menu, type MenuProps } from 'antd';
import styles from './Sidebar.module.css';

type MenuItem = NonNullable<MenuProps['items']>[number];

export interface SidebarItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
}

export interface SidebarProps {
  /** 顶部区域，如 Logo、应用名 */
  header?: ReactNode;
  /** 导航项 */
  items: SidebarItem[];
  /** 当前选中项的 key，由外部控制 */
  selectedKey?: string | undefined;
  /** 点击导航项时回调 */
  onSelect?: (key: string) => void;
  /** 底部区域，如用户信息、设置入口；折叠时隐藏 */
  footer?: ReactNode;
  /** 折叠成只剩一列图标，悬停图标显示名称 */
  collapsed?: boolean;
}

/** 侧边栏：header / 导航列表 / footer 三段，不依赖路由。 */
export const Sidebar = ({
  header,
  items,
  selectedKey,
  onSelect,
  footer,
  collapsed = false,
}: SidebarProps) => (
  <div
    className={
      collapsed ? `${styles.sidebar} ${styles.collapsed}` : styles.sidebar
    }
  >
    {header != null && <div className={styles.header}>{header}</div>}
    <nav className={styles.nav}>
      <Menu
        mode="inline"
        inlineCollapsed={collapsed}
        className={styles.menu}
        items={items.map<MenuItem>(({ key, label, icon }) => ({
          key,
          label,
          icon,
        }))}
        selectedKeys={selectedKey ? [selectedKey] : []}
        onClick={({ key }) => onSelect?.(key)}
      />
    </nav>
    {footer != null && !collapsed && (
      <div className={styles.footer}>{footer}</div>
    )}
  </div>
);
