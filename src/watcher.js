// watch.mjs

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ES 模块中没有 __dirname，需要自己生成
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIR_INPUT_RECORDS = process.env.DIR_INPUT_RECORDS;
const dirToWatch = path.resolve(DIR_INPUT_RECORDS);

// 确保目录存在
if (!fs.existsSync(dirToWatch)) {
  fs.mkdirSync(dirToWatch, { recursive: true });
}

console.log(`📡 正在监听目录: ${dirToWatch}`);

fs.watch(dirToWatch, { recursive: true }, (eventType, filename) => {
  if (filename) {
    console.log(
      `[${new Date().toLocaleString()}] 事件: ${eventType}  文件: ${filename}`,
    );
  } else {
    console.log(
      `[${new Date().toLocaleString()}] 事件: ${eventType} (未知文件)`,
    );
  }
});
