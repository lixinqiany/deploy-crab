process.env.NODE_ENV = 'development';

const { bootstrap } = await import('./src/bootstrap.js');
await bootstrap({ mode: 'development' });

export {};
