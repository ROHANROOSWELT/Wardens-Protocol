const fs = require('fs');

const txs = [
  { action: "register_agent", deploy_hash: "d610cac5b3c0925e8af94efc1ecf091e2b552e69ce3b916f0f6510ffe63e1f51", result: "Agent aggregator-agent-1 registered", timestamp: 1721890000000 },
  { action: "register_agent", deploy_hash: "7fd2efb353e5772e81d4097d244f18cd3441c4c30aa61da2fc1750733c255a77", result: "Agent challenger-agent-1 registered", timestamp: 1721890001000 },
  { action: "post_bond", deploy_hash: "05c098cd6adeaa3f74e61e08f7dc1c0882e493e181b127a3fc33dc5c8f8fcadf", result: "Agent aggregator-agent-1 posted bond 10", timestamp: 1721890002000 },
  { action: "post_bond", deploy_hash: "fa0ff60d280a4fe594bc2605be0242164d291244ce68a0fa830285a75c38f774", result: "Agent challenger-agent-1 posted bond 25", timestamp: 1721890003000 },
  { action: "create_asset", deploy_hash: "59f503919b94411831529e645b26a55e5c29517ec88de41106c1c4358de074a9", result: "Asset INV-001 created", timestamp: 1721890004000 },
  { action: "create_asset", deploy_hash: "7e84bf42924dbe48f970cc5556e075e48d97df176dd0fd3f925e0fed211aaa4c", result: "Asset INV-002-DUPLICATE created", timestamp: 1721890005000 },
  { action: "create_asset", deploy_hash: "b075dd7d34ff04167326eea110a91b67623cfd10cab8e940042ab97a44764e13", result: "Asset INV-003-LYING-SCORE created", timestamp: 1721890006000 },
  { action: "submit_score", deploy_hash: "fe6a8aff26d6b92e318d1c59b8962b8e781ce12d3f9a4277c382a257c52ec022", result: "Score 94 submitted for INV-001", timestamp: 1721890007000 },
  { action: "deposit_collateral", deploy_hash: "2e48d4008580578ccb038fb6f181876cfe4e504409dad4b419ca5208b9738486", result: "Collateral 1000 deposited for INV-001", timestamp: 1721890008000 },
  { action: "borrow", deploy_hash: "5b0c1a44ef732ab91e0d21ff54c3742de4b848e4d3ca378862429844ad2b3138", result: "Borrow 700 for INV-001 (reverted: ScoreStale)", timestamp: 1721890009000 },
  { action: "submit_score", deploy_hash: "e560ea033483ca56229cb9bdc2158c505615c50a7e5f2629c5639ba940ebc804", result: "Score 46 submitted for INV-002-DUPLICATE", timestamp: 1721890010000 },
  { action: "submit_score", deploy_hash: "ba5b9338598d04c2c70f923720e4bb7faadf9950497ed97cf3af0a5e4afd7be4", result: "Score 98 submitted for INV-003-LYING-SCORE", timestamp: 1721890011000 },
  { action: "open_challenge", deploy_hash: "35a8bf5e30ae56a0fe1c59f53125fa22ab93b3cc55735de0f45875093d78fce1", result: "Challenge opened for Score 3", timestamp: 1721890012000 },
  { action: "resolve_challenge", deploy_hash: "8696659c12edcaf4444289e81edbd24c64f85503c99ca96725c903bb82014fae", result: "Challenge 1 resolved (Upheld)", timestamp: 1721890013000 }
];

fs.writeFileSync('.local/transactions.json', JSON.stringify(txs, null, 2));
console.log('transactions.json successfully updated with 14 mocked CLI hashes.');
