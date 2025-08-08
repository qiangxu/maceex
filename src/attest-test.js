const crypto = require("crypto");
const { eas, SchemaEncoder } = require("./eas");
const { signer, provider } = require("./client");


const schemaUID = "0xcb086ec854a03129a886407008b777592634fd93ae2a46565e0ea7d3e9a6cf23"

async function main() {
    const encoder = new SchemaEncoder(
          "string BAR_NO,string PROJT_TYPE,string COUNTRY,uint256 BAR_VOL,uint256 BAR_AMT,string BUYER,string SELLER"
    );

    const encoded = encoder.encodeData([ 
        { name: 'BAR_NO', value: 'TX202508080001', type: 'string' },
        { name: 'PROJT_TYPE', value: 'DigitalTrade', type: 'string' },
        { name: 'COUNTRY', value: 'SG', type: 'string' },
        { name: 'BAR_VOL', value: '1001234', type: 'uint256' },
        { name: 'BAR_AMT', value: '888884321', type: 'uint256' },
        { name: 'BUYER', value: 'Alibaba', type: 'string' },
        { name: 'SELLER', value: 'Shopee', type: 'string' }
    ]);


    // 发起交易
    //
    const tx = await eas.attest({
        schema: schemaUID,
        data: {
            recipient: "0x0000000000000000000000000000000000000000",
            expirationTime: 0,
            revocable: true,
            data: encoded,
        },
    });


    console.log("⏳ Transaction submitted!");

    const uid = await tx.wait();
    console.log("✅ Attestation UID:", uid);  // 链上 attestation 唯一标识符
}


main().catch((err) => {
    console.error("❌ Error occurred:", err);
});

