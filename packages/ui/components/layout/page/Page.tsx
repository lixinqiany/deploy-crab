import type { ReactNode } from 'react';
import styles from './Page.module.css';

export interface PageProps {
  /** 页面标题 */
  title?: ReactNode;
  /** 标题栏右侧区域，如操作按钮 */
  extra?: ReactNode;
  /** 页面内容 */
  children?: ReactNode;
}

/** 页面：标题栏 + 内容区，不关心自己被放在哪个布局里。 */
export const Page = ({ title, extra, children }: PageProps) => (
  <section className={styles.page}>
    {(title != null || extra != null) && (
      <header className={styles.header}>
        <h1 className={styles.title}>
          {title != null && <span className={styles.dot} aria-hidden />}
          {title}
        </h1>
        {extra != null && <div className={styles.extra}>{extra}</div>}
      </header>
    )}
    <div className={styles.content}>{children}</div>
  </section>
);
