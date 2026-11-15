import './style.css';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { StyleProvider } from '@ant-design/cssinjs';
import { QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import { queryClient } from './api/query-client';
import { router } from './routes';
import { amberTheme } from './theme';

createRoot(document.getElementById('app')!).render(
  <StyleProvider layer>
    <ConfigProvider theme={amberTheme}>
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  </StyleProvider>,
);
