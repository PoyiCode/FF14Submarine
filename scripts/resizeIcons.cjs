// 將 ./data/icon 中的所有 PNG 圖片縮小為 20x20，另存至 ./src/data/icon
// 使用方式：node scripts/resizeIcons.cjs
'use strict';

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const INPUT_DIR = path.join(__dirname, '../data/icon');
const OUTPUT_DIR = path.join(__dirname, '../src/data/icon');
const SIZE = 20;

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`已建立目錄：${OUTPUT_DIR}`);
  }

  const files = fs.readdirSync(INPUT_DIR).filter((f) => f.endsWith('.png'));
  console.log(`共 ${files.length} 張圖片，開始縮放至 ${SIZE}x${SIZE}...\n`);

  let success = 0;
  let failed = 0;

  for (const file of files) {
    const src = path.join(INPUT_DIR, file);
    const dest = path.join(OUTPUT_DIR, file);
    try {
      await sharp(src)
        .resize(SIZE, SIZE, { fit: 'fill' })
        .png()
        .toFile(dest);
      success++;
    } catch (err) {
      console.error(`  ✗ ${file}：${err.message}`);
      failed++;
    }
  }

  console.log(`完成！成功：${success}，失敗：${failed}`);
  console.log(`圖片儲存於：${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error('發生錯誤：', err);
  process.exit(1);
});
