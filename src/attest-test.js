const crypto = require("crypto");
const { eas, SchemaEncoder } = require("./eas");
const { signer, provider } = require("./client");


const schemaUID = "0x213e6fb6cdca22ffb14f199dbe27101fbd23dcb1c3f6e01451dc1035774bd779"

async function main() {
	const encoder = new SchemaEncoder("string order_id, bytes32 order_hash, uint64 timestamp");

	const order = {
		order_id: "ORDER123",
		user: "user001",
		amount: "88.00",
	};

	const orderHash = "0x" + crypto.createHash("sha256").update(JSON.stringify(order)).digest("hex");


	const encoded = encoder.encodeData([
		{ name: "order_id", value: order.order_id, type: "string" },
		{ name: "order_hash", value: orderHash, type: "bytes32" },
		{ name: "timestamp", value: Math.floor(Date.now() / 1000), type: "uint64" },
	]);

	// 发起交易
	const tx = await eas.attest({
		schema: schemaUID,
		data: {
			recipient: "0x0000000000000000000000000000000000000000",
			expirationTime: 0,
			revocable: true,
			data: encoded,
		},
	});

	// 不调用 tx.wait()，而是自己手动等交易完成（不触发 SDK 的事件解析）
	console.log("⏳ Transaction submitted!");

	const rawTx = await tx.wait();
	console.log(rawTx)

}



main().catch((err) => {
	console.error("❌ Error occurred:", err);
});

