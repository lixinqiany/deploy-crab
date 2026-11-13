import { useEffect, useRef, useState, type PointerEvent } from 'react';

export interface SidebarResizeOptions {
  /** 初始宽度，默认 224 */
  defaultWidth?: number;
  /** 最小宽度，拖到这里就停住，默认 180 */
  minWidth?: number;
  /** 最大宽度，拖到这里就停住，默认 360 */
  maxWidth?: number;
  /** 折叠线：鼠标越过它（往左）就折叠，往右越过就展开，默认 120 */
  collapseThreshold?: number;
  /** 折叠后只剩图标列的宽度，默认 64 */
  collapsedWidth?: number;
}

/** 折叠/展开动画时长（ms），要和 AppLayout.module.css 里的 transition 一致 */
const ANIMATION_MS = 200;

/** 把 value 限制在 [min, max] 之间 */
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * 侧边栏拖拽调宽 + 拖过头折叠。
 * 显示宽度被限制在 [minWidth, maxWidth]，但折叠判断看的是鼠标原始位置：
 * 拖到 minWidth 停住后，鼠标再往左越过 collapseThreshold 才折叠。
 */
export const useSidebarResize = ({
  defaultWidth = 224,
  minWidth = 180,
  maxWidth = 360,
  collapseThreshold = 120,
  collapsedWidth = 64,
}: SidebarResizeOptions = {}) => {
  const [width, setWidth] = useState(defaultWidth);
  const [collapsed, setCollapsed] = useState(false);
  const [resizing, setResizing] = useState(false);
  /** 正在播放折叠/展开动画：只有这段时间里宽度变化才带过渡 */
  const [animating, setAnimating] = useState(false);
  /** 动画结束的定时器 id；改它不需要重新渲染，所以用 ref */
  const timerRef = useRef<number | undefined>(undefined);

  // 组件卸载时清掉还没触发的定时器
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  /** 切换折叠状态，并在动画时长内打开过渡 */
  const toggleCollapsed = (next: boolean) => {
    setCollapsed(next);
    setAnimating(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(
      () => setAnimating(false),
      ANIMATION_MS,
    );
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    e.preventDefault(); // 防止拖动时选中文字
    e.currentTarget.setPointerCapture(e.pointerId);
    setResizing(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!resizing) return;
    const x = e.clientX; // 鼠标原始位置，不受上下限影响

    const shouldCollapse = x < collapseThreshold;
    if (shouldCollapse !== collapsed) toggleCollapsed(shouldCollapse);

    // 折叠时保留原宽度不动，展开后会接着用
    if (!shouldCollapse) setWidth(clamp(x, minWidth, maxWidth));
  };

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setResizing(false);
  };

  return {
    /** 实际要给侧栏的宽度 */
    width: collapsed ? collapsedWidth : width,
    collapsed,
    resizing,
    animating,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp, // 被系统打断（如切窗口）时也要收尾
    },
  };
};
