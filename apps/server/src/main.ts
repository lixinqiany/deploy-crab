process.env.NODE_ENV = 'production';

const { bootstrap } = await import('./bootstrap');
await bootstrap();

export {};
