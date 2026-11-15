import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  /** 说明这里是空的，例如「还没有主机」 */
  title: ReactNode;
  /** 说明这里放什么、下一步做什么 */
  description?: ReactNode;
  /** 主操作按钮的文字；不传则不显示按钮 */
  actionLabel?: ReactNode;
  onAction?: () => void;
}

/** 列表为空时的引导：说明这里放什么，并给出第一步操作。 */
export const EmptyState = ({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) => (
  <div className={styles.root}>
    <h3 className={styles.title}>{title}</h3>
    {description != null && <p className={styles.description}>{description}</p>}
    {actionLabel != null && (
      <Button type="primary" icon={<PlusOutlined />} onClick={onAction}>
        {actionLabel}
      </Button>
    )}
  </div>
);
