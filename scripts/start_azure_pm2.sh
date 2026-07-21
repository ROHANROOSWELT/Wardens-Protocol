#!/bin/bash
set -e

IP="20.6.128.197"
USER="azureuser"
KEY="/home/rohan/Downloads/wardens-protocol_key.pem"

echo "Booting up Wardens Protocol backend and agents on Azure..."
ssh -i $KEY -o StrictHostKeyChecking=no $USER@$IP << 'EOF'
  set -e
  export PATH="$HOME/.bun/bin:$PATH"

  # Kill any stray processes
  pkill -f bun || true

  # Ensure ecosystem.config.js is correct (removing dashboard)
  cd ~/wardens
  cat << 'PM2EOF' > ecosystem.config.js
module.exports = {
  apps: [
    { name: 'backend', script: 'bun', args: 'run dev', cwd: './backend', env: { WARDENS_MODE: 'chain', PORT: '4000' } },
    { name: 'parser', script: 'bun', args: 'src/index.ts', cwd: './agents/parser-agent' },
    { name: 'fraud', script: 'bun', args: 'src/index.ts', cwd: './agents/fraud-agent' },
    { name: 'registry', script: 'bun', args: 'src/index.ts', cwd: './agents/registry-agent' },
    { name: 'aggregator', script: 'bun', args: 'src/index.ts', cwd: './agents/aggregator-agent' },
    { name: 'challenger', script: 'bun', args: 'src/index.ts', cwd: './agents/challenger-agent' }
  ]
};
PM2EOF

  echo "Starting PM2 processes..."
  pm2 start ecosystem.config.js
  pm2 save
  echo "PM2 Status:"
  pm2 status
EOF
echo "Backend is live!"
