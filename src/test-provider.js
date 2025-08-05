require("dotenv").config();
const { JsonRpcProvider } = require("ethers");

console.log("RPC URL:", process.env.ARBITRUM_RPC_URL);

const provider = new JsonRpcProvider(process.env.ARBITRUM_RPC_URL);

async function main() {
      const blockNumber = await provider.getBlockNumber();
      console.log("✅ Connected! Current block number:", blockNumber);
}

main().catch(console.error);

