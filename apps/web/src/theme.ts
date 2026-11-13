import type { ThemeConfig } from 'antd';

/**
 * 配色参考 Radix Colors 的做法：大面积用暖灰（Sand），琥珀只做点缀。
 * 背景、边框、文字都是中性暖灰；主色只出现在按钮、选中态、状态灯这些小面积元素上。
 */

/** Radix Sand（暖灰）：背景、边框、文字 */
export const sand = {
  1: '#fdfdfc',
  2: '#f9f9f8',
  3: '#f1f0ef',
  4: '#e9e8e6',
  6: '#dad9d6',
  9: '#8d8d86',
  11: '#63635e',
  12: '#21201c',
} as const;

/** 琥珀：主色及其浅/深两端 */
export const amber = {
  /** 主色，按钮、状态灯、焦点环 */
  main: '#d97706',
  /** 文字级琥珀，用于链接和选中项文字（Radix amber11） */
  text: '#ab6400',
  /** 深琥珀棕，用于品牌名（Radix amber12） */
  deep: '#4f3422',
} as const;

export const amberTheme: ThemeConfig = {
  token: {
    colorPrimary: amber.main,
    colorInfo: amber.main,
    colorLink: amber.text,
    colorTextBase: sand[12],
    colorBgBase: '#ffffff',
    colorBgLayout: sand[2],
    colorBorder: sand[6],
    colorBorderSecondary: sand[4],
    borderRadius: 8,
  },
  components: {
    Menu: {
      itemBg: 'transparent',
      itemColor: sand[11],
      itemHoverColor: sand[12],
      itemHoverBg: 'rgba(33, 32, 28, 0.05)',
      itemActiveBg: 'rgba(33, 32, 28, 0.08)',
      // 选中态只带一层很淡的琥珀，文字用深一档的琥珀保证对比度
      itemSelectedBg: 'rgba(217, 119, 6, 0.1)',
      itemSelectedColor: amber.text,
    },
  },
};
