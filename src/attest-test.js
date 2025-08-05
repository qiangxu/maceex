const { eas, SchemaEncoder } = require("./eas");

const schemaUID = "0xYOUR_SCHEMA_UID"; // 替换为你的真实 schema

async function main() {
  const encoder = new SchemaEncoder("string order_id, bytes32 order_hash, uint64 timestamp");

  const encoded = encoder.encodeData([
    { name: "order_id", value: "ORDER123", type: "string" },
    { name: "order_hash", value: "0x1234...abcd", type: "bytes32" },
    { name: "timestamp", value: Math.floor(Date.now() / 1000), type: "uint64" },
  ]);

  const tx = await eas.attest({
    schema: schemaUID,
    data: {
      recipient: "0x0000000000000000000000000000000000000000",
      expirationTime: 0,
      revocable: true,
      data: encoded,
    },
  });

  const receipt = await tx.wait();
  console.log("✅ Attestation Tx:", receipt.transactionHash);
}

main();

