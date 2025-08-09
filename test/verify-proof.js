// test/verify-proof.js (debug 版)
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import keccak256 from 'keccak256';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const hexToBuf = (hex) => Buffer.from(hex.replace(/^0x/, ''), 'hex');
const bufToHex = (buf) => '0x' + buf.toString('hex');

// 与构树完全一致：不排序 key，直接 JSON.stringify(order)
function hashLeaf(order) {
  const json = JSON.stringify(order);
  return keccak256(Buffer.from(json)); // Buffer
}

// sortPairs:true 的验证
function verifyProofDebug(leafBuf, proofHexList, merkleRootHex) {
  let hash = Buffer.from(leafBuf);
  console.log('LEAF (computed):', bufToHex(hash));

  proofHexList.forEach((siblingHex, idx) => {
    const sib = hexToBuf(siblingHex);
    const [left, right] = Buffer.compare(hash, sib) <= 0 ? [hash, sib] : [sib, hash];
    const combined = Buffer.concat([left, right]);
    const next = keccak256(combined);
    console.log(`STEP ${idx + 1}`);
    console.log('  sibling :', siblingHex);
    console.log('  left    :', bufToHex(left));
    console.log('  right   :', bufToHex(right));
    console.log('  combined:', bufToHex(combined));
    console.log('  next    :', bufToHex(next));
    hash = next;
  });

  const finalHex = bufToHex(hash).toLowerCase();
  const rootHex = merkleRootHex.toLowerCase();
  console.log('FINAL   :', finalHex);
  console.log('EXPECTED:', rootHex);
  return finalHex === rootHex;
}

const run = async () => {
  const proofPath = process.argv[2] || path.resolve(__dirname, './proof_sample.json');
  const merkleRoot = process.argv[3] || process.env.MERKLE_ROOT;

  if (!merkleRoot) {
    console.error('❌ 请提供 Merkle Root（参数或 MERKLE_ROOT 环境变量）');
    process.exit(1);
  }

  const raw = await fs.readFile(proofPath, 'utf-8');
  const entry = JSON.parse(raw);

  const leaf = hashLeaf(entry.order);
  const ok = verifyProofDebug(leaf, entry.proof, merkleRoot);

  console.log(`Record ID: ${entry.record_id}`);
  console.log(`Merkle Proof Valid: ${ok}`);
};

run().catch((e) => {
  console.error('❌ Verify failed:', e);
  process.exit(1);
});

