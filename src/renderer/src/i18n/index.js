import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../locales/en.json'
import zh from '../locales/zh.json'
import zhTw from '../locales/zh-TW.json'
import ja from '../locales/ja.json'
import { inferUiLocaleFromNavigator, normalizeUiLocale } from '../utils/uiLocale'

function mapStringsDeep(value, mapFn) {
  if (typeof value === 'string') return mapFn(value)
  if (Array.isArray(value)) return value.map((v) => mapStringsDeep(v, mapFn))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = mapStringsDeep(v, mapFn)
    return out
  }
  return value
}

function deepMerge(base, override) {
  if (!override || typeof override !== 'object') return base
  if (!base || typeof base !== 'object' || Array.isArray(base)) return override
  if (Array.isArray(override)) return override
  const out = { ...base }
  for (const [k, v] of Object.entries(override)) {
    const baseV = base[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && baseV && typeof baseV === 'object' && !Array.isArray(baseV)) {
      out[k] = deepMerge(baseV, v)
    } else {
      out[k] = v
    }
  }
  return out
}

function toZhTw(text) {
  // Word/term-level first (Taiwan preference)
  let out = String(text)
    .replaceAll('歌单', '播放清單')
    .replaceAll('播放列表', '播放清單')
    .replaceAll('队列', '佇列')
    .replaceAll('媒体库', '媒體庫')
    .replaceAll('资料库', '資料庫')
    .replaceAll('资源库', '資源庫')
    .replaceAll('文件夹', '資料夾')
    .replaceAll('导入', '匯入')
    .replaceAll('导出', '匯出')
    .replaceAll('设置', '設定')
    .replaceAll('搜索', '搜尋')
    .replaceAll('刷新', '重新整理')
    .replaceAll('日志', '日誌')
    .replaceAll('兼容', '相容')
    .replaceAll('三方', '第三方')
    .replaceAll('音频', '音訊')
    .replaceAll('视频', '影片')
    .replaceAll('内存', '記憶體')
    .replaceAll('资源管理器', '檔案總管')
    .replaceAll('回收站', '資源回收筒')

  // Lightweight Simplified → Traditional pass for common UI characters.
  // Not a full OpenCC replacement; keeps bundle size and deps minimal.
  const table = [
    // Common UI words (multi-char first)
    ['自动', '自動'],
    ['参数', '參數'],
    ['简体', '簡體'],
    ['繁体', '繁體'],
    ['默认', '預設'],
    ['应用', '應用程式'],
    ['设备', '裝置'],
    ['文件', '檔案'],
    ['缓存', '快取'],
    ['保存', '儲存'],
    ['删除', '刪除'],
    ['确定', '確定'],
    ['下载', '下載'],
    ['上传', '上傳'],
    ['账号', '帳號'],
    ['登录', '登入'],
    ['退出', '登出'],
    ['音乐', '音樂'],
    ['音质', '音質'],
    ['分钟', '分鐘'],
    ['后', '後'],
    ['台', '臺'],
    ['里', '裡'],
    ['云', '雲'],
    ['书', '書'],
    ['车', '車'],
    ['东', '東'],
    ['乐', '樂'],
    ['为', '為'],
    ['么', '麼'],
    ['体', '體'],
    ['与', '與'],
    ['于', '於'],
    ['发', '發'],
    ['复', '復'],
    ['这', '這'],
    ['那', '那'],
    ['个', '個'],
    ['们', '們'],
    ['开', '開'],
    ['关', '關'],
    ['启', '啟'],
    ['显', '顯'],
    ['隐', '隱'],
    ['听', '聽'],
    ['画', '畫'],
    ['蓝', '藍'],
    ['网', '網'],
    ['连', '連'],
    ['线', '線'],
    ['项', '項'],
    ['设', '設'],
    ['置', '置'],
    ['导', '導'],
    ['入', '入'],
    ['出', '出'],
    ['统', '統'],
    ['夹', '夾'],
    ['图', '圖'],
    ['画质', '畫質'],
    ['加载', '載入'],
    ['取消', '取消'],
    ['提示', '提示'],
    ['错误', '錯誤'],
    ['失败', '失敗'],
    ['成功', '成功'],
    ['艺', '藝'],
    ['专', '專'],
    ['辑', '輯'],
    ['数', '數'],
    ['时', '時'],
    ['间', '間'],
    ['钟', '鐘'],
    ['秒', '秒']
  ]
  for (const [from, to] of table) out = out.replaceAll(from, to)
  return out
}

function buildZhTwFromZh(zhSource) {
  return mapStringsDeep(zhSource, toZhTw)
}

function buildZhTwTranslation() {
  const generated = buildZhTwFromZh(zh)
  return deepMerge(generated, zhTw)
}

function initialLng() {
  try {
    const raw = localStorage.getItem('nc_config')
    if (raw) {
      const p = JSON.parse(raw)
      if (p && typeof p.uiLocale === 'string') {
        return normalizeUiLocale(p.uiLocale)
      }
    }
  } catch (_) {}
  return inferUiLocaleFromNavigator()
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
    'zh-TW': { translation: buildZhTwTranslation() },
    ja: { translation: ja }
  },
  lng: initialLng(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export default i18n
