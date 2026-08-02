#!/bin/bash
set -e

IP="20.6.128.197"
USER="azureuser"
KEY="/home/rohan/Downloads/wardens-protocol_key.pem"
DIR="/home/rohan/Desktop/final_hope3/wardens"

echo "======================================"
echo "🚀 DEPLOYING WARDENS PROTOCOL TO AZURE"
echo "======================================"

echo "Step 1/4: Copying source code to the server (excluding huge folders)..."
rsync -az -e "ssh -i $KEY -o StrictHostKeyChecking=no" \
    --exclude 'node_modules' --exclude '.git' --exclude 'target' --exclude '.next' \
    $DIR $USER@$IP:~/

echo "Step 2/4: Copying Casper blockchain private key..."
ssh -i $KEY -o StrictHostKeyChecking=no $USER@$IP "mkdir -p ~/Desktop/keys"
scp -i $KEY -o StrictHostKeyChecking=no /home/rohan/Desktop/keys/* $USER@$IP:~/Desktop/keys/

echo "Step 3/4: Setting up server dependencies and building Next.js (This takes 2-3 minutes)..."
ssh -i $KEY -o StrictHostKeyChecking=no $USER@$IP << 'EOF'
  set -e
  # 1. Install Node.js (for PM2) and Bun (for speed)
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null 2>&1
  sudo apt-get install -y nodejs > /dev/null 2>&1
  sudo npm install -g pm2 > /dev/null 2>&1
  curl -fsSL https://bun.sh/install | bash > /dev/null 2>&1
  export PATH="$HOME/.bun/bin:$PATH"

  # 2. Setup Port 80 Forwarding so judges can just type the IP in the browser!
  sudo iptables -t nat -C PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000 2>/dev/null || \
    sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000
  sudo iptables-save | sudo tee /etc/iptables.rules > /dev/null 2>&1

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

  echo "--> Building livenet executor..."
  cd ~/wardens/contracts/wardens_core && ~/.cargo/bin/cargo build --features livenet --bin wardens_livenet || cargo build --features livenet --bin wardens_livenet

  # 4. Generate PM2 Ecosystem Configuration
  cd ~/wardens
  cat << 'PM2EOF' > ecosystem.config.js
const BUN = '/home/azureuser/.bun/bin/bun';
const ENV = { PATH: '/home/azureuser/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' };
module.exports = {
  apps: [
    { name: 'backend',  script: BUN, args: 'src/index.ts', cwd: './backend',              env: { ...ENV, WARDENS_MODE: 'chain' } },
    { name: 'parser',   script: BUN, args: 'src/index.ts', cwd: './agents/parser-agent',  env: ENV },
    { name: 'fraud',    script: BUN, args: 'src/index.ts', cwd: './agents/fraud-agent',   env: ENV },
    { name: 'registry', script: BUN, args: 'src/index.ts', cwd: './agents/registry-agent',env: ENV },
    { name: 'dashboard', script: './node_modules/next/dist/bin/next', args: 'start -p 3000', cwd: './dashboard', interpreter: 'node', env: { ...ENV, PORT: '3000' } },
  ]
};
PM2EOF

  echo "--> Preserving local storage (tracked assets, transactions, and cache)..."

  echo "--> Launching entire ecosystem in the background!"
  pm2 delete all 2>/dev/null || true
  sudo fuser -k 3000/tcp 2>/dev/null || true
  sudo fuser -k 4000/tcp 2>/dev/null || true
  pm2 start ecosystem.config.js
  pm2 save
EOF

echo "======================================"
echo "✅ DEPLOYMENT COMPLETE!"
echo "Your app is now live at: http://$IP"
echo "======================================"
