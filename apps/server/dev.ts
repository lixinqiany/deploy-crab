process.env.NODE_ENV = 'development';

const { bootstrap } = await import('./src/bootstrap');
await bootstrap();

export {};
