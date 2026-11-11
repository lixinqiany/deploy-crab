import { createRoot } from 'react-dom/client';
import { StyleProvider } from '@ant-design/cssinjs';
import { App as AntdApp, ConfigProvider } from 'antd';
import { App } from './App';
import './style.css';

createRoot(document.getElementById('app')!).render(
  <StyleProvider layer>
    <ConfigProvider>
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </StyleProvider>,
);
