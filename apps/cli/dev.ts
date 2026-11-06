process.env.NODE_ENV = 'development';

const { runCli } = await import('./src/bootstrap');
await runCli('development');

export {};
