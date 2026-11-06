process.env.NODE_ENV = 'development';

const { runCli } = await import('./src/bootstrap.js');
await runCli('development');

export {};
