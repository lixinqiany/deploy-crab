import type { ComponentType, CSSProperties, SVGProps } from 'react';

/** 任意 SVG React 组件，如 vite-plugin-svgr 的 `import X from './x.svg?react'` */
export type SvgComponent = ComponentType<SVGProps<SVGSVGElement>>;

export interface SvgIconProps extends Omit<SVGProps<SVGSVGElement>, 'color'> {
  /** 要渲染的 SVG 组件 */
  component: SvgComponent;
  /** 宽高，数字按 px 处理，默认 24px */
  size?: number | string;
  /**
   * 图标颜色，作用于 SVG 中未指定 fill 或 fill="currentColor" 的部分；
   * 自带 fill 的多色图形保持原色。不传则继承文字颜色。
   */
  color?: string;
}

export const SvgIcon = ({
  component: Svg,
  size = 24,
  color,
  style,
  ...rest
}: SvgIconProps) => {
  const mergedStyle: CSSProperties = {
    // 显式 inline-block：避免被 Tailwind preflight 等全局 reset 的 `svg { display: block }` 挤成独占一行
    display: 'inline-block',
    flexShrink: 0,
    verticalAlign: '-0.125em',
    ...(color != null && { color }),
    ...style,
  };

  return (
    <Svg
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
      focusable={false}
      {...rest}
      style={mergedStyle}
    />
  );
};
