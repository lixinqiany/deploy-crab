import type { HTMLAttributes, ReactNode } from 'react';
import styles from './AppLayout.module.css';

export interface AppLayoutProps {
  /** 左侧区域，通常传入 <Sidebar />；不传则只渲染右侧内容 */
  sidebar?: ReactNode;
  /** 左侧区域宽度，默认 224px */
  sidebarWidth?: number | string;
  /** 传了就在侧栏右边缘渲染拖拽把手 */
  resizeHandleProps?: HTMLAttributes<HTMLDivElement>;
  /** 是否正在拖动：拖动中保持全局光标、禁止选中文字 */
  resizing?: boolean;
  /** 是否在播放折叠/展开动画：为 true 时宽度变化带过渡 */
  animating?: boolean;
  /** 右侧主区域内容 */
  children?: ReactNode;
}

/**
 * 左右两栏外壳：负责摆放，不关心内容。
 * 左栏全高，宽度由外部控制；右栏占满剩余宽度，内容超出时在右栏内部滚动。
 */
export const AppLayout = ({
  sidebar,
  sidebarWidth = 224,
  resizeHandleProps,
  resizing = false,
  animating = false,
  children,
}: AppLayoutProps) => (
  <div className={resizing ? `${styles.root} ${styles.resizing}` : styles.root}>
    {sidebar != null && (
      <aside
        className={
          animating ? `${styles.sider} ${styles.animating}` : styles.sider
        }
        style={{ width: sidebarWidth }}
      >
        {sidebar}
        {resizeHandleProps && (
          <div className={styles.handle} {...resizeHandleProps} />
        )}
      </aside>
    )}
    <main className={styles.main}>{children}</main>
  </div>
);
