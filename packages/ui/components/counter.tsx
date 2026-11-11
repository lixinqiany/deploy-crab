import React, { useState } from 'react';
import { Button } from 'antd';

export const Counter: React.FC = () => {
  const [count, setCount] = useState(0);

  return (
    <Button
      id="counter"
      type="primary"
      htmlType="button"
      className="min-w-32"
      onClick={() => setCount((value) => value + 1)}
    >
      {count}
    </Button>
  );
};
