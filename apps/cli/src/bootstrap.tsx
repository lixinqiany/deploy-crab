import { prepareDataDirectory, type RuntimeMode } from '@deploy-crab/core';
import { Command } from 'commander';
import { Box, render, Text, useApp, useInput } from 'ink';

function App() {
  const { exit } = useApp();

  useInput((input) => {
    if (input === 'q') exit();
  });

  return (
    <Box flexDirection="column">
      <Text color="cyan" bold>
        deploy-crab
      </Text>
      <Text>按 q 或 Ctrl+C 退出。</Text>
    </Box>
  );
}

export async function runCli(mode: RuntimeMode) {
  const program = new Command()
    .name('deploy-crab')
    .description('部署管理工具')
    .version('0.0.1');

  program.action(async () => {
    await prepareDataDirectory(mode);
    const app = render(<App />);
    await app.waitUntilExit();
  });

  await program.parseAsync(process.argv);
}
