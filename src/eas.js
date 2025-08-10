import 'dotenv/config';
import { ethers } from 'ethers';
import { EAS, SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';

const {
  RPC_URL,
  PRIVATE_KEY,
  EAS_CONTRACT_ADDRESS,
  SCHEMA_UID
} = process.env;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer   = new ethers.Wallet(PRIVATE_KEY, provider);

const eas = new EAS(EAS_CONTRACT_ADDRESS);
eas.connect(signer);

const encoder = new SchemaEncoder(
  'bytes32 merkle_root,string batch_id,uint64 count,string proofs_pointer'
);

export async function attestMerkleBatch({ merkle_root, batch_id, count, proofs_pointer }) {
  const data = encoder.encodeData([
    { name: 'merkle_root',    value: merkle_root,   type: 'bytes32' },
    { name: 'batch_id',       value: batch_id,      type: 'string'  },
    { name: 'count',          value: Number(count), type: 'uint64'  },
    { name: 'proofs_pointer', value: proofs_pointer,type: 'string'  }
  ]);

  const nonce = await provider.getTransactionCount(signer.address);
  const tx = await eas.attest({
    schema: SCHEMA_UID,
    data: {
      recipient: ethers.ZeroAddress,
      expirationTime: 0,
      revocable: true,
      data
    },
	nonce,
  });
  // EAS SDK: tx.tx.hash 可拿到 raw tx hash；tx.uid 是 attestation uid
  const attestation_uid = await tx.wait();
  return { uid: attestation_uid, txHash: tx.receipt.hash };
}

export async function getReceipt(txHash) {
  console("debug: ", txHash);
  console(provider.getTransactionReceipt(txHash));
  return provider.getTransactionReceipt(txHash);
}

