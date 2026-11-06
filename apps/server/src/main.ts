process.env.NODE_ENV = 'production';

const { bootstrap } = await import('./bootstrap.js');
await bootstrap({ mode: 'production' });

export {};
