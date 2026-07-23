#!/bin/bash
set -e

IP="20.6.128.197"
USER="azureuser"
KEY="/home/rohan/Downloads/wardens-protocol_key.pem"

echo "Fixing Next.js Environment Variables for Cloud Deployment..."
ssh -i $KEY -o StrictHostKeyChecking=no $USER@$IP << EOF
  set -e
  export PATH="\$HOME/.bun/bin:\$PATH"
  
  # 1. Update NEXT_PUBLIC_BACKEND_URL to the Public Azure IP
  echo "NEXT_PUBLIC_BACKEND_URL=http://$IP:4000" > ~/wardens/dashboard/.env
  echo "NEXT_PUBLIC_CASPER_EXPLORER_BASE=https://testnet.cspr.live" >> ~/wardens/dashboard/.env
  echo "NEXT_PUBLIC_WARDENS_CORE_HASH=hash-ef137b674026c1c08e55fc16e7d9e0dac9eec6b1a96b9f0b54b8fc729a9874de" >> ~/wardens/dashboard/.env

  # 2. Rebuild the frontend
  echo "Rebuilding dashboard (takes ~1 minute)..."
  cd ~/wardens/dashboard
  bun run build
  
  # 3. Restart PM2 processes
  pm2 restart dashboard
EOF

echo "Fix applied!"
