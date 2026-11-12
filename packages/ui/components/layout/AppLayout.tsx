import type { ReactNode } from 'react';
import styles from './AppLayout.module.css';

export interface AppLayoutProps {
  /** 左侧区域，通常传入 <Sidebar />；不传则只渲染右侧内容 */
  sidebar?: ReactNode;
  /** 左侧区域宽度，默认 224px */
  sidebarWidth?: number | string;
  /** 右侧主区域内容 */
  children?: ReactNode;
}

/**
 * 左右两栏外壳：负责摆放，不关心内容。
 * 左栏固定宽度、全高；右栏占满剩余宽度，内容超出时在右栏内部滚动。
 */
export const AppLayout = ({
  sidebar,
  sidebarWidth = 224,
  children,
}: AppLayoutProps) => (
  <div className={styles.root}>
    {sidebar != null && (
      <aside className={styles.sider} style={{ width: sidebarWidth }}>
        {sidebar}
      </aside>
    )}
    <main className={styles.main}>{children}</main>
  </div>
);
