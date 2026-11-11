import React from 'react';
import { Typography } from 'antd';

interface HeaderProps {
  title: string;
}

export const Header: React.FC<HeaderProps> = ({ title }) => {
  return (
    <header id="header" className="mb-6">
      <Typography.Title level={1} className="m-0">
        {title}
      </Typography.Title>
    </header>
  );
};
