import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useEffect, useState, type MouseEvent } from 'react';
import styles from './CopyButton.module.css';

export interface CopyButtonProps {
  /** 点击后写入剪贴板的内容 */
  text: string;
  /** 悬停提示，也作为读屏器读出的按钮名称，例如「复制 ssh 命令」 */
  label: string;
  /** 已复制后的提示，默认「已复制」 */
  copiedLabel?: string;
  className?: string;
}

/** 复制成功后，对勾保持多久再变回复制图标（ms） */
const RESET_MS = 1400;

/**
 * 复制按钮：点击把 `text` 写入剪贴板，图标短暂变成对勾确认已复制。
 *
 * 点击不会冒泡，放在「点整行打开详情」的行里也不会误触发外层。
 * 颜色默认继承文字颜色，深色背景上可以通过 `className` 调整。
 */
export const CopyButton = ({
  text,
  label,
  copiedLabel = '已复制',
  className,
}: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), RESET_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async (event: MouseEvent) => {
    event.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  return (
    <Tooltip title={copied ? copiedLabel : label} mouseEnterDelay={0.3}>
      <button
        type="button"
        aria-label={label}
        onClick={(event) => void copy(event)}
        className={className ? `${styles.button} ${className}` : styles.button}
      >
        {copied ? <CheckOutlined className={styles.check} /> : <CopyOutlined />}
      </button>
    </Tooltip>
  );
};
