/** Dialog filter/title strings for Electron file pickers (mirror renderer locales: en | zh | ja). */

const STRINGS = {
  en: {
    filterAudio: 'Audio',
    filterLyrics: 'Lyrics',
    filterImages: 'Images',
    filterThemeJson: 'Theme JSON',
    filterSettingsJson: 'Settings JSON',
    saveThemeTitle: 'Save theme',
    saveSettingsTitle: 'Export settings',
    saveExportTitle: 'Export Nightcore Audio',
    filterWav: 'Audio File',
    filterFonts: 'Font files'
  },
  zh: {
    filterAudio: '音频',
    filterLyrics: '歌词',
    filterImages: '图片',
    filterThemeJson: '主题 JSON',
    saveThemeTitle: '保存主题',
    saveExportTitle: '导出 Nightcore 音频',
    filterWav: '音频文件',
    filterFonts: '字体文件'
  },
  'zh-TW': {
    filterAudio: '音訊',
    filterLyrics: '歌詞',
    filterImages: '圖片',
    filterThemeJson: '主題 JSON',
    filterSettingsJson: '設定 JSON',
    saveThemeTitle: '儲存主題',
    saveSettingsTitle: '匯出設定',
    saveExportTitle: '匯出 Nightcore 音訊',
    filterWav: '音訊檔案',
    filterFonts: '字型檔案'
  },
  ja: {
    filterAudio: '音声',
    filterLyrics: '歌詞',
    filterImages: '画像',
    filterThemeJson: 'テーマ JSON',
    saveThemeTitle: 'テーマを保存',
    saveExportTitle: 'Nightcore 音声を書き出し',
    filterWav: '音声ファイル',
    filterFonts: 'フォント'
  }
}

export function getDialogStrings(locale) {
  const key = locale === 'zh' || locale === 'zh-TW' || locale === 'ja' ? locale : 'en'
  return STRINGS[key]
}
