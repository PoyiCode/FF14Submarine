// 從 garlandtools API 以 item id 取得 icon 圖片，儲存至 ./data/icon/
// 使用方式：node scripts/fetchIcons.cjs
// item 來源：products.json, recipes.json, submarineParts.json, basicMaterials.json
'use strict';

const garlandtools = require('garlandtools-api');
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../data/icon');
// 每次請求之間的延遲（毫秒），避免對 API 造成過多請求
const DELAY_MS = 300;

// ── 收集所有 JSON 檔案中的唯一 item id ──────────────────────
function collectIds() {
  const files = [
    '../src/data/products.json',
    '../src/data/recipes.json',
    '../src/data/submarineParts.json',
    '../src/data/basicMaterials.json',
  ];
  const ids = new Set();
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf-8'));
    for (const entry of Object.values(data)) {
      if (entry.id != null) ids.add(entry.id);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

// ── 以 HTTPS 下載 URL 至指定檔案路徑 ────────────────────────
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

// ── 延遲工具 ─────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── 主流程 ───────────────────────────────────────────────────
async function main() {
  // 建立輸出目錄（若不存在）
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`已建立目錄：${OUTPUT_DIR}`);
  }

  const ids = collectIds();
  console.log(`共 ${ids.length} 個唯一 item id，開始取得 icon...\n`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    process.stdout.write(`[${i + 1}/${ids.length}] id=${id} `);

    // 取得 item 資料以獲取 icon 編號
    let iconId;
    try {
      const data = await garlandtools.item(id);
      iconId = data?.item?.icon;
      if (iconId == null) {
        console.log(`→ 無 icon 欄位，略過`);
        skipped++;
        await sleep(DELAY_MS);
        continue;
      }
    } catch (err) {
      console.log(`→ 取得 item 失敗：${err.message}`);
      failed++;
      await sleep(DELAY_MS);
      continue;
    }

    // 若已存在則略過
    const destPath = path.join(OUTPUT_DIR, `${iconId}.png`);
    if (fs.existsSync(destPath)) {
      console.log(`→ icon=${iconId}.png 已存在，略過`);
      skipped++;
      await sleep(DELAY_MS);
      continue;
    }

    // 下載 PNG 圖片
    // garlandtools icon URL 格式：/files/icons/item/{iconId}.png
    const iconUrl = `https://www.garlandtools.org/files/icons/item/${iconId}.png`;
    try {
      await downloadFile(iconUrl, destPath);
      console.log(`→ icon=${iconId}.png 已儲存`);
      success++;
    } catch (err) {
      console.log(`→ 下載 icon=${iconId} 失敗：${err.message}`);
      failed++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n完成！成功：${success}，略過：${skipped}，失敗：${failed}`);
  console.log(`圖片儲存於：${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error('發生錯誤：', err);
  process.exit(1);
});
