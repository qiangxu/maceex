| CREATED DATE                 | CREATED BY                    | VERSION |
| ---------------------------- | ----------------------------- | ------- |
| 2025年08月05日 星期二 22时18分27秒     | qiangxu, toxuqiang@gmail.com  | 0.1     |


# On-Chain Orders (Base + EAS)

将订单上链记录至 Base 网络，使用 EAS 协议，后端控制交易，无需用户钱包参与。

## 使用步骤

1. 安装依赖

```
npm install
```

2. 配置环境变量

```
cp .env.example .env
```

3. 测试订单

```
node src/batch.js
```

4. 验证结果：
访问 [EAS Base Sepolia Explorer](https://base-sepolia.easscan.org/)，搜索Tx Hash。


## 网络配置

- 网络名称: Base Sepolia
- RPC: https://sepolia.base.org 
- 浏览器: https://sepolia.arbiscan.io
- EAS Explorer: https://base-sepolia.easscan.org
