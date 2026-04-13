// 儲存檔案工具：
// 優先使用 File System Access API（showSaveFilePicker）讓使用者選擇儲存路徑；
// 若瀏覽器不支援則退回 <a download> 的傳統下載方式

export async function saveFile(filename: string, content: string): Promise<void> {
  // File System Access API：Chrome / Edge 86+ 支援，顯示系統另存新檔對話框
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as Window & typeof globalThis & {
        showSaveFilePicker: (opts?: object) => Promise<FileSystemFileHandle>
      }).showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'JSON 檔案', accept: { 'application/json': ['.json'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      return
    } catch (e) {
      // 使用者取消選擇（AbortError）時直接返回，其他錯誤退回傳統下載
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
  }

  // 退回方案：<a download> 觸發下載，瀏覽器自動存至預設下載資料夾
  const blob = new Blob([content], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
