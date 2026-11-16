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
  /** 导航与页脚之间的可伸缩区域，例如会话列表。 */
  content?: ReactNode;
  /** 折叠成只剩一列图标，悬停图标显示名称 */
  collapsed?: boolean;
}

/** 侧边栏：固定 header / 导航 / footer，可选 content 填满剩余高度，不依赖路由。 */
export const Sidebar = ({
  header,
  items,
  selectedKey,
  onSelect,
  footer,
  content,
  collapsed = false,
}: SidebarProps) => (
  <div
    className={
      collapsed ? `${styles.sidebar} ${styles.collapsed}` : styles.sidebar
    }
  >
    {header != null && <div className={styles.header}>{header}</div>}
    <nav className={content != null ? styles.fixedNav : styles.nav}>
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
    {content != null && <div className={styles.content}>{content}</div>}
    {footer != null && !collapsed && (
      <div className={styles.footer}>{footer}</div>
    )}
  </div>
);
