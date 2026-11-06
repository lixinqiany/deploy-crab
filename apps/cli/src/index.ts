#!/usr/bin/env node
process.env.NODE_ENV = "production";

const { runCli } = await import("./bootstrap.js");
await runCli("production");

export {};
