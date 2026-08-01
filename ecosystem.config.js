const sharedEnv = {
  WARDENS_MODE: 'chain',
  WARDENS_CORE_ADDRESS: 'contract-package-ef137b674026c1c08e55fc16e7d9e0dac9eec6b1a96b9f0b54b8fc729a9874de',
  // Domain URLs — no raw IPs
  ODRA_CASPER_LIVENET_NODE_ADDRESS: 'https://node.testnet.casper.network/rpc',
  ODRA_CASPER_LIVENET_CHAIN_NAME: 'casper-test',
  ODRA_CASPER_LIVENET_SECRET_KEY_PATH: '/home/azureuser/Desktop/keys/secret_key.pem',
  ODRA_CASPER_LIVENET_EVENTS_URL: 'https://node.testnet.casper.network/events/main',
  CASPER_NODE_URL: 'https://node.testnet.casper.network/rpc',
  CASPER_CHAIN_NAME: 'casper-test',
  CASPER_EVENT_STREAM_URL: 'https://node.testnet.casper.network/events/main',
  BACKEND_PRIVATE_KEY_PATH: '/home/azureuser/Desktop/keys/secret_key.pem',
};

module.exports = {
  apps: [
    { name: 'backend',    script: 'bun', args: 'src/index.ts',  cwd: './backend',                autorestart: true,  env: { ...sharedEnv, PORT: '4000' } },
    { name: 'parser',     script: 'bun', args: 'src/index.ts',  cwd: './agents/parser-agent',    autorestart: true,  env: { ...sharedEnv, PORT: '4101' } },
    { name: 'fraud',      script: 'bun', args: 'src/index.ts',  cwd: './agents/fraud-agent',     autorestart: true,  env: { ...sharedEnv, PORT: '4102' } },
    { name: 'registry',   script: 'bun', args: 'src/index.ts',  cwd: './agents/registry-agent',  autorestart: true,  env: { ...sharedEnv, PORT: '4103' } },
    { name: 'aggregator', script: 'bun', args: 'src/index.ts',  cwd: './agents/aggregator-agent', autorestart: false, env: sharedEnv },
    { name: 'challenger', script: 'bun', args: 'src/index.ts',  cwd: './agents/challenger-agent', autorestart: false, env: sharedEnv },
  ]
};
