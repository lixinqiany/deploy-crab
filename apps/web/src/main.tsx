import './style.css';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { StyleProvider } from '@ant-design/cssinjs';
import { App as AntdApp, ConfigProvider } from 'antd';
import { router } from './routes';
import { amberTheme } from './theme';

createRoot(document.getElementById('app')!).render(
  <StyleProvider layer>
    <ConfigProvider theme={amberTheme}>
      <AntdApp>
        <RouterProvider router={router} />
      </AntdApp>
    </ConfigProvider>
  </StyleProvider>,
);
