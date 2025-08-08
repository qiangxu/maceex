import { ethers } from 'ethers';
import { EAS, SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';
import 'dotenv/config';

const {
  RPC_URL,
  PRIVATE_KEY,
  SCHEMA_UID,
  EAS_CONTRACT_ADDRESS,
} = process.env;

export async function createEAS() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const eas = new EAS(EAS_CONTRACT_ADDRESS);
  await eas.connect(wallet);

  const encoder = new SchemaEncoder(
    'string BAR_NO,string PROJT_TYPE,string COUNTRY,uint256 BAR_VOL,uint256 BAR_AMT,string BUYER,string SELLER'
  );

  return {
    encodeData(record) {
      return encoder.encodeData([
        { name: 'BAR_NO', value: record.BAR_NO, type: 'string' },
        { name: 'PROJT_TYPE', value: record.PROJT_TYPE, type: 'string' },
        { name: 'COUNTRY', value: record.COUNTRY, type: 'string' },
        { name: 'BAR_VOL', value: record.BAR_VOL, type: 'uint256' },
        { name: 'BAR_AMT', value: record.BAR_AMT, type: 'uint256' },
        { name: 'BUYER', value: record.BUYER, type: 'string' },
        { name: 'SELLER', value: record.SELLER, type: 'string' },
      ]);
    },

    async attest(encodedData) {
      return await eas.attest({
        schema: SCHEMA_UID,
        data: {
          recipient: ethers.ZeroAddress,
          expirationTime: 0,
          revocable: true,
          data: encodedData,
        }
      });
    },

    async getUID(tx) {
      const events = await tx.wait();
      const uid = events.logs?.[0]?.data?.slice(0, 66); // 通常 UID 为 32 bytes 的 hex
      return uid;
    }
  };
}

