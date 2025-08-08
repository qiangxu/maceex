// src/eas.js
import 'dotenv/config';
import { ethers } from 'ethers';
import { EAS, SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';
import { parseCsvSchema, encodeDataFromSchema } from '../tools/schema-tools.js';

// 加载环境变量
const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCHEMA_UID = process.env.SCHEMA_UID;
const SCHEMA_CSV_PATH = process.env.SCHEMA_CSV_PATH || './data/schema.csv';

// 初始化 provider 和 signer
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// 初始化 EAS SDK
const eas = new EAS(process.env.EAS_CONTRACT_ADDRESS);
eas.connect(signer);

// 预加载字段定义
const schemaFields = parseCsvSchema(SCHEMA_CSV_PATH);

// 主函数：提交一条 attestation
export async function attestRecord(record) {
	const encoded = new SchemaEncoder(
		schemaFields.map(f => `${f.type} ${f.name}`).join(',')
	).encodeData(encodeDataFromSchema(schemaFields, record));

	let nonce = await provider.getTransactionCount(signer.address);
	const tx = await eas.attest({
		schema: SCHEMA_UID,
		data: {
			recipient: ethers.ZeroAddress,
			expirationTime: 0,
			revocable: true,
			data: encoded
		},
		nonce,
	});

	return tx;
}

