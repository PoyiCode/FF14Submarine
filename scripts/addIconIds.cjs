// 為四個 JSON 資料檔中的每個 item 新增 iconId 欄位
// iconId 為 garlandtools 圖片檔名（不含副檔名），對應 src/data/icon/{iconId}.png
// 使用方式：node scripts/addIconIds.cjs
'use strict';

const garlandtools = require('garlandtools-api');
const fs = require('fs');
const path = require('path');

const FILES = [
  '../src/data/products.json',
  '../src/data/recipes.json',
  '../src/data/submarineParts.json',
  '../src/data/basicMaterials.json',
];
const DELAY_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // 讀取所有 JSON 檔，收集唯一 item id → {file, key} 清單
  const fileDataMap = {};
  const idToLocations = {};  // id → [{ filePath, key }]

  for (const rel of FILES) {
    const filePath = path.join(__dirname, rel);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    fileDataMap[filePath] = data;

    for (const [key, entry] of Object.entries(data)) {
      const id = entry.id;
      if (id == null) continue;
      if (!idToLocations[id]) idToLocations[id] = [];
      idToLocations[id].push({ filePath, key });
    }
  }

  const uniqueIds = Object.keys(idToLocations).map(Number).sort((a, b) => a - b);
  console.log(`共 ${uniqueIds.length} 個唯一 item id，開始查詢 iconId...\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < uniqueIds.length; i++) {
    const id = uniqueIds[i];
    process.stdout.write(`[${i + 1}/${uniqueIds.length}] id=${id} `);

    let iconId;
    try {
      const data = await garlandtools.item(id);
      iconId = data?.item?.icon;
      if (iconId == null) {
        console.log(`→ 無 icon 欄位，略過`);
        failed++;
        await sleep(DELAY_MS);
        continue;
      }
    } catch (err) {
      console.log(`→ 取得失敗：${err.message}`);
      failed++;
      await sleep(DELAY_MS);
      continue;
    }

    // 將 iconId 寫入所有對應的 JSON entry
    for (const { filePath, key } of idToLocations[id]) {
      fileDataMap[filePath][key].iconId = String(iconId);
    }
    console.log(`→ iconId=${iconId}`);
    success++;

    await sleep(DELAY_MS);
  }

  // 寫回所有 JSON 檔案
  for (const [filePath, data] of Object.entries(fileDataMap)) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`已寫入：${filePath}`);
  }

  console.log(`\n完成！成功：${success}，失敗：${failed}`);
}

main().catch((err) => {
  console.error('發生錯誤：', err);
  process.exit(1);
});
