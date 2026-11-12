import './style.css';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { StyleProvider } from '@ant-design/cssinjs';
import { App as AntdApp, ConfigProvider } from 'antd';
import { router } from './routes';

createRoot(document.getElementById('app')!).render(
  <StyleProvider layer>
    <ConfigProvider>
      <AntdApp>
        <RouterProvider router={router} />
      </AntdApp>
    </ConfigProvider>
  </StyleProvider>,
);
