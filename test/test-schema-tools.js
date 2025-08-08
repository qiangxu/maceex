const path = require('path');
const {
	parseCsvSchema,
	generateSchemaDefinition,
	encodeDataFromSchema,
} = require('../tools/schema-tools');

// 加载 schema CSV
const csvPath = path.join(__dirname, '../data/schema.csv');
const fields = parseCsvSchema(csvPath);

// 打印生成的 schema 定义（用于 EAS 注册）
console.log('📜 Schema Definition for EAS:');
console.log(generateSchemaDefinition(fields));

// 准备测试订单数据
const testOrder = {
	BAR_NO: "TX202508080001",
	PROJT_TYPE: "DigitalTrade",
	COUNTRY: "SG",
	BAR_VOL: "100.1234",
	BAR_AMT: "88888.4321",
	BUYER: "Alibaba",
	SELLER: "Shopee"
};

// 打印编码结果
console.log('\n🔧 Encoded Data for EAS:');
console.log(encodeDataFromSchema(fields, testOrder));

