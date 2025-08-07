require("dotenv").config();
console.log("🛠️ Using RPC URL:", process.env.BASE_RPC_URL);
const { JsonRpcProvider, Wallet } = require("ethers");

const provider = new JsonRpcProvider(process.env.BASE_RPC_URL);
const signer = new Wallet(process.env.PRIVATE_KEY, provider);

module.exports = { provider, signer };

