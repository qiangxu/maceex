const { EAS, SchemaEncoder } = require("@ethereum-attestation-service/eas-sdk");
const { signer } = require("./client");

const EAS_CONTRACT_ADDRESS = "0x4200000000000000000000000000000000000021"; // Arbitrum Sepolia

const eas = new EAS(EAS_CONTRACT_ADDRESS);
eas.connect(signer);

module.exports = { eas, SchemaEncoder };

