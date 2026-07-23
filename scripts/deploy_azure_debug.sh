#!/bin/bash
set -e

IP="20.6.128.197"
USER="azureuser"
KEY="/home/rohan/Downloads/wardens-protocol_key.pem"
DIR="/home/rohan/Desktop/final_hope3/wardens"

echo "Step 3/4: Setting up server dependencies and building Next.js (This takes 2-3 minutes)..."
ssh -i $KEY -o StrictHostKeyChecking=no $USER@$IP << 'EOF'
  set -e
  # 1. Install Node.js (for PM2) and Bun (for speed)
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs unzip
  sudo npm install -g pm2
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"

  # 2. Setup Port 80 Forwarding so judges can just type the IP in the browser!
  sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000
  sudo iptables-save | sudo tee /etc/iptables.rules

  # 3. Install dependencies in parallel
  echo "--> Installing backend and agents..."
  cd ~/wardens/backend && bun install
  sed -i 's|/home/rohan|/home/azureuser|g' .env
  
  cd ~/wardens/agents/parser-agent && bun install
  cd ~/wardens/agents/fraud-agent && bun install
  cd ~/wardens/agents/registry-agent && bun install
  cd ~/wardens/agents/aggregator-agent && bun install
  cd ~/wardens/agents/challenger-agent && bun install
  
  echo "--> Building the Next.js Dashboard..."
  cd ~/wardens/dashboard && bun install && bun run build

  # 4. Generate PM2 Ecosystem Configuration
  cd ~/wardens
  cat << 'PM2EOF' > ecosystem.config.js
module.exports = {
  apps: [
    { name: 'backend', script: 'bun', args: 'run dev', cwd: './backend', env: { WARDENS_MODE: 'chain' } },
    { name: 'parser', script: 'bun', args: 'src/index.ts', cwd: './agents/parser-agent' },
    { name: 'fraud', script: 'bun', args: 'src/index.ts', cwd: './agents/fraud-agent' },
    { name: 'registry', script: 'bun', args: 'src/index.ts', cwd: './agents/registry-agent' },
    { name: 'aggregator', script: 'bun', args: 'src/index.ts', cwd: './agents/aggregator-agent' },
    { name: 'challenger', script: 'bun', args: 'src/index.ts', cwd: './agents/challenger-agent' },
    { name: 'dashboard', script: 'bun', args: 'run start', cwd: './dashboard', env: { PORT: '3000' } }
  ]
};
PM2EOF

  echo "--> Launching entire ecosystem in the background!"
  pm2 start ecosystem.config.js
  pm2 save
EOF

echo "✅ DEPLOYMENT COMPLETE!"
