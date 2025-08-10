| CREATED DATE                 | CREATED BY                    | VERSION |
| ---------------------------- | ----------------------------- | ------- |
| 2025年08月09日 星期六 19时48分03秒     | qiangxu, toxuqiang@gmail.com  | 0.1     |

## 上链过程

```
┌───────────────────────────────────────────────────────────────┐
│                   ① 收集待处理订单（链下）                    │
│  - 扫描 DIR_INPUT_RECORDS 下所有 .ndjson                      │
│  - 过滤：只保留 DB 里尚未 attestation 的 record_id            │
└───────────────┬───────────────────────────────────────────────┘
                │ （一批新订单）
                ▼
┌───────────────────────────────────────────────────────────────┐
│            ② 生成承诺（Commitments / Leaves）                 │
│  - 对每条订单：JSON.stringify(order)                          │
│  - keccak256 → 得到 leaf（每条订单一个 leaf）                 │
└───────────────┬───────────────────────────────────────────────┘
                │（叶子集合 leaves[]）
                ▼
┌───────────────────────────────────────────────────────────────┐
│                   ③ 构建 Merkle Tree（链下）                  │
│  - 使用 leaves 构建树（sortPairs: true）                      │
│  - 计算 Merkle Root（代表整批数据的指纹）                     │
│  - 为每条订单生成 Merkle Proof（兄弟路径）                    │
└───────────────┬───────────────────────────────────────────────┘
                │（root、每条 record 的 proof）
                ▼
┌───────────────────────────────────────────────────────────────┐
│                  ④ 批次产物落盘（链下存储）                   │
│  - root-<batch_id>.json：{ root, count, batch_id, … }         │
│  - proofs-<batch_id>.ndjson：逐行 {record_id, leaf, proof}    │
│  - 可选：把 proofs 文件上 IPFS，得到 proofs_cid               │
└───────────────┬───────────────────────────────────────────────┘
                │（root 与 proofs 的稳定指针/路径/CID）
                ▼
┌───────────────────────────────────────────────────────────────┐
│             ⑤ 上链批次声明（EAS Attestation）                 │
│  - Schema：                                                   │
│    bytes32 merkle_root, string batch_id, uint64 count,        │
│    string proofs_pointer                                      │
│  - 提交一笔 attest：只上链 root + 元数据（不暴露明文订单）    │
│  - 返回 attestation_uid                                       │
└───────────────┬───────────────────────────────────────────────┘
                │（attestation_uid）
                ▼
┌───────────────────────────────────────────────────────────────┐
│                 ⑥ 写入索引（单表 DB：attestations）           │
│  - 对本批每个 record_id 插入一行：                            │
│    { batch_id, record_id, merkle_root, proofs_cid,            │
│      attestation_uid, created_at }                            │
│  - 以后可通过 record_id → O(1) 反查 root/uid/proofs           │
└───────────────────────────────────────────────────────────────┘

```

## 验真流程（用户或审计要验证某条订单）

1) 拿到订单明文（或你发给他的脱敏副本）
2) 用 record_id 在 DB 查：对应 batch_id、merkle_root、proofs_pointer
3) 从 proofs_pointer 获取该 record_id 的 proof
4) 本地计算 leaf（同样的序列化 + 承诺方式）
5) 用 leaf + proof 复原 root，比较是否等于链上 merkle_root → 相等：证明该订单确实包含在当时那批数据里（无需暴露整批数据）

