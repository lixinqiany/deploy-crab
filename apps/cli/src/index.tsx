#!/usr/bin/env node
import { Command } from "commander";
import { Box, render, Text, useApp, useInput } from "ink";

function App() {
  const { exit } = useApp();

  useInput((input) => {
    if (input === "q") exit();
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

const program = new Command()
  .name("deploy-crab")
  .description("部署管理工具")
  .version("0.0.0");

program.action(async () => {
  const app = render(<App />);
  await app.waitUntilExit();
});

await program.parseAsync(process.argv);
