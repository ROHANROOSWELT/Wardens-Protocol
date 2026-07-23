module.exports = {
  apps: [
    { name: 'backend',    script: 'bun', args: 'run dev',     cwd: './backend',                autorestart: true  },
    { name: 'parser',     script: 'bun', args: 'src/index.ts', cwd: './agents/parser-agent',    autorestart: true  },
    { name: 'fraud',      script: 'bun', args: 'src/index.ts', cwd: './agents/fraud-agent',      autorestart: true  },
    { name: 'registry',   script: 'bun', args: 'src/index.ts', cwd: './agents/registry-agent',   autorestart: true  },
    // aggregator and challenger are one-shot CLI tools — run once on demand, do not loop.
    { name: 'aggregator', script: 'bun', args: 'src/index.ts', cwd: './agents/aggregator-agent', autorestart: false },
    { name: 'challenger', script: 'bun', args: 'src/index.ts', cwd: './agents/challenger-agent', autorestart: false },
  ]
};

