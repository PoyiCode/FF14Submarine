// 從 garlandtools API 取得 item 資料，寫入 src/data/itemList.json
// 使用方式：node scripts/fetchItems.cjs
'use strict';

const garlandtools = require('garlandtools-api');
const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '../src/data/itemList.json');
const FETCH_COUNT = 10;

async function main() {
  console.log('正在取得 data index...');
  const coreData = await garlandtools.data();

  // data.item.partialIndex：以 item id 字串為 key 的物件，每筆結構為 { i, n, l, c, t }
  const partialIndex = coreData?.item?.partialIndex;
  if (!partialIndex || typeof partialIndex !== 'object') {
    console.error('無法取得 item 清單，data.item 結構：', JSON.stringify(Object.keys(coreData?.item ?? {})));
    process.exit(1);
  }

  // 依 id 升冪排序，取最小的 FETCH_COUNT 筆
  const sorted = Object.values(partialIndex).sort((a, b) => a.i - b.i);
  const targets = sorted.slice(0, FETCH_COUNT);

  console.log(`共 ${sorted.length} 筆 item，取 id 最小的 ${FETCH_COUNT} 筆：`);
  targets.forEach(t => console.log(`  id=${t.i}  name=${t.n}`));

  const result = {};
  for (const target of targets) {
    console.log(`\n正在取得 item ${target.i}（${target.n}）...`);
    const data = await garlandtools.item(target.i);
    result[target.i] = data;
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n完成！已寫入 ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('發生錯誤：', err);
  process.exit(1);
});
