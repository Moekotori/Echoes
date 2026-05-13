export type Locale = 'zh-CN' | 'zh-TW' | 'ja-JP' | 'en-US';

export const localeOptions: Array<{ locale: Locale; label: string }> = [
  { locale: 'zh-CN', label: '简体中文' },
  { locale: 'zh-TW', label: '繁體中文' },
  { locale: 'ja-JP', label: '日本語' },
  { locale: 'en-US', label: 'English' },
];

export type TranslationKey =
  | 'app.navigation.main'
  | 'app.navigation.utility'
  | 'app.toolbar.quickActions'
  | 'app.toolbar.windowControls'
  | 'app.window.minimize'
  | 'app.window.maximize'
  | 'app.window.close'
  | 'common.available'
  | 'common.build'
  | 'common.checking'
  | 'common.dev'
  | 'common.disabled'
  | 'common.enabled'
  | 'common.loading'
  | 'common.na'
  | 'common.no'
  | 'common.ready'
  | 'common.unavailable'
  | 'common.yes'
  | 'notice.browserFolderPicker'
  | 'notice.browserFilePicker'
  | 'notice.windowControlsDesktop'
  | 'queue.action.clear'
  | 'queue.action.dragLabel'
  | 'queue.action.dragTitle'
  | 'queue.action.generateRandom'
  | 'queue.action.generatingRandom'
  | 'queue.action.like'
  | 'queue.action.more'
  | 'queue.action.openFolder'
  | 'queue.action.play'
  | 'queue.action.playNext'
  | 'queue.action.remove'
  | 'queue.action.shuffle'
  | 'queue.count'
  | 'queue.empty.description'
  | 'queue.empty.title'
  | 'queue.error.desktopBridge'
  | 'queue.error.noRandomTracks'
  | 'queue.header.kicker'
  | 'queue.header.title'
  | 'queue.now.actions'
  | 'queue.now.emptyDescription'
  | 'queue.now.emptyTitle'
  | 'queue.now.kicker'
  | 'queue.now.quality'
  | 'queue.now.sourceFallback'
  | 'queue.now.waitingAudio'
  | 'queue.quality.unknown'
  | 'queue.randomSource'
  | 'queue.repeat.all'
  | 'queue.repeat.mode'
  | 'queue.repeat.off'
  | 'queue.repeat.one'
  | 'queue.tools'
  | 'queue.upNext.kicker'
  | 'queue.upNext.title'
  | 'queue.upNext.waitingCount'
  | 'queue.unknownAlbum'
  | 'queue.unknownArtist'
  | 'route.albums.description'
  | 'route.albums.label'
  | 'route.artists.description'
  | 'route.artists.label'
  | 'route.audioSettings.description'
  | 'route.audioSettings.label'
  | 'route.folders.description'
  | 'route.folders.label'
  | 'route.history.description'
  | 'route.history.label'
  | 'route.importFile.description'
  | 'route.importFile.label'
  | 'route.importFolder.description'
  | 'route.importFolder.label'
  | 'route.liked.description'
  | 'route.liked.label'
  | 'route.lyricsSettings.description'
  | 'route.lyricsSettings.label'
  | 'route.playlists.description'
  | 'route.playlists.label'
  | 'route.queue.description'
  | 'route.queue.label'
  | 'route.remote.description'
  | 'route.remote.label'
  | 'route.settings.description'
  | 'route.settings.label'
  | 'route.songs.description'
  | 'route.songs.label'
  | 'settings.about.audioHost.description'
  | 'settings.about.audioHost.title'
  | 'settings.about.devMode.description'
  | 'settings.about.devMode.title'
  | 'settings.about.nativeSqlite.description'
  | 'settings.about.nativeSqlite.title'
  | 'settings.appearance.density.compact'
  | 'settings.appearance.density.description'
  | 'settings.appearance.density.standard'
  | 'settings.appearance.density.title'
  | 'settings.appearance.font.choose'
  | 'settings.appearance.font.chinese.description'
  | 'settings.appearance.font.chinese.title'
  | 'settings.appearance.font.main.description'
  | 'settings.appearance.font.main.title'
  | 'settings.appearance.fontSize.description'
  | 'settings.appearance.fontSize.title'
  | 'settings.appearance.lineHeight.description'
  | 'settings.appearance.lineHeight.title'
  | 'settings.appearance.reset.action'
  | 'settings.appearance.reset.description'
  | 'settings.appearance.reset.title'
  | 'settings.appearance.textDepth.description'
  | 'settings.appearance.textDepth.title'
  | 'settings.appearance.theme.dark'
  | 'settings.appearance.theme.description'
  | 'settings.appearance.theme.followSystem'
  | 'settings.appearance.theme.light'
  | 'settings.appearance.theme.title'
  | 'settings.danger.clearCache.description'
  | 'settings.danger.clearCache.title'
  | 'settings.devices.empty'
  | 'settings.devices.title'
  | 'settings.general.backup.description'
  | 'settings.general.backup.export'
  | 'settings.general.backup.import'
  | 'settings.general.backup.title'
  | 'settings.general.closeToTray'
  | 'settings.general.language.description'
  | 'settings.general.language.title'
  | 'settings.header.searchPlaceholder'
  | 'settings.integrations.discord.description'
  | 'settings.integrations.discord.title'
  | 'settings.integrations.mobile.description'
  | 'settings.integrations.mobile.title'
  | 'settings.library.network.description'
  | 'settings.library.network.title'
  | 'settings.library.networkSources.description'
  | 'settings.library.networkSources.title'
  | 'settings.library.networkPanel.applyMissingOnly'
  | 'settings.library.networkPanel.applySelected'
  | 'settings.library.networkPanel.appliedCount'
  | 'settings.library.networkPanel.artistField'
  | 'settings.library.networkPanel.artistSource'
  | 'settings.library.networkPanel.candidates'
  | 'settings.library.networkPanel.cover'
  | 'settings.library.networkPanel.embeddedCover'
  | 'settings.library.networkPanel.embeddedMetadata'
  | 'settings.library.networkPanel.kicker'
  | 'settings.library.networkPanel.localCover'
  | 'settings.library.networkPanel.missingCover'
  | 'settings.library.networkPanel.noCandidates'
  | 'settings.library.networkPanel.providerErrors'
  | 'settings.library.networkPanel.reject'
  | 'settings.library.networkPanel.repairMissing'
  | 'settings.library.networkPanel.repairThisTrack'
  | 'settings.library.networkPanel.scanComplete'
  | 'settings.library.networkPanel.scanMissing'
  | 'settings.library.networkPanel.scanDone'
  | 'settings.library.networkPanel.scanPreparing'
  | 'settings.library.networkPanel.scanProgress'
  | 'settings.library.networkPanel.scanRunning'
  | 'settings.library.networkPanel.showCandidates'
  | 'settings.library.networkPanel.title'
  | 'settings.library.networkPanel.titleField'
  | 'settings.library.networkPanel.trackId'
  | 'settings.library.networkPanel.trackNotFound'
  | 'settings.library.networkPanel.unknownArtist'
  | 'settings.library.networkPanel.untitled'
  | 'settings.nav.about.description'
  | 'settings.nav.about.label'
  | 'settings.nav.appearance.description'
  | 'settings.nav.appearance.label'
  | 'settings.nav.danger.description'
  | 'settings.nav.danger.label'
  | 'settings.nav.eq.description'
  | 'settings.nav.eq.label'
  | 'settings.nav.general.description'
  | 'settings.nav.general.label'
  | 'settings.nav.integrations.description'
  | 'settings.nav.integrations.label'
  | 'settings.nav.library.description'
  | 'settings.nav.library.label'
  | 'settings.nav.playback.description'
  | 'settings.nav.playback.label'
  | 'settings.nav.remote.description'
  | 'settings.nav.remote.label'
  | 'settings.playback.audioStatus.description'
  | 'settings.playback.audioStatus.title'
  | 'settings.playback.followCurrent.description'
  | 'settings.playback.followCurrent.title'
  | 'settings.playback.outputDevice.description'
  | 'settings.playback.outputDevice.empty'
  | 'settings.playback.outputDevice.title'
  | 'settings.playback.outputMode.description'
  | 'settings.playback.outputMode.title'
  | 'settings.playback.speedMode.description'
  | 'settings.playback.speedMode.title'
  | 'settings.playback.wireless.description'
  | 'settings.playback.wireless.title'
  | 'settings.remote.library.description'
  | 'settings.remote.library.title';

type TranslationMap = Record<TranslationKey, string>;

const zhCN: TranslationMap = {
  'app.navigation.main': '主导航',
  'app.navigation.utility': '工具导航',
  'app.toolbar.quickActions': '快捷操作',
  'app.toolbar.windowControls': '窗口控制',
  'app.window.minimize': '最小化',
  'app.window.maximize': '最大化',
  'app.window.close': '关闭',
  'common.available': '可用',
  'common.build': '构建版',
  'common.checking': '检查中',
  'common.dev': '开发版',
  'common.disabled': '未启用',
  'common.enabled': '已启用',
  'common.loading': '加载中',
  'common.na': '无',
  'common.no': '否',
  'common.ready': '就绪',
  'common.unavailable': '暂不可用',
  'common.yes': '是',
  'notice.browserFolderPicker': '浏览器预览已打开文件夹选择器。真实曲库导入需要使用 Electron 桌面应用。',
  'notice.browserFilePicker': '浏览器预览已选择 {name}。请在 ECHO Next 桌面端通过 Audio Core 播放。',
  'notice.windowControlsDesktop': '窗口控制只在 Electron 桌面窗口中可用。',
  'queue.action.clear': '清空队列',
  'queue.action.dragLabel': '拖拽 {title}',
  'queue.action.dragTitle': '拖拽排序',
  'queue.action.generateRandom': '生成随机队列',
  'queue.action.generatingRandom': '生成中',
  'queue.action.like': '喜欢',
  'queue.action.more': '更多',
  'queue.action.openFolder': '打开所在文件夹',
  'queue.action.play': '立即播放 {title}',
  'queue.action.playNext': '下一首播放 {title}',
  'queue.action.remove': '移除 {title}',
  'queue.action.shuffle': '随机播放',
  'queue.count': '{count} 首',
  'queue.empty.description': '播放歌曲、加入队列或选择下一首播放后，这里会出现队列内容。',
  'queue.empty.title': '还没有接下来播放的歌曲',
  'queue.error.desktopBridge': '桌面桥接不可用。请在 ECHO Next 桌面端读取曲库。',
  'queue.error.noRandomTracks': '曲库里还没有可加入随机队列的歌曲。',
  'queue.header.kicker': '播放队列',
  'queue.header.title': '队列',
  'queue.now.actions': '当前曲目操作',
  'queue.now.emptyDescription': '从歌曲或专辑开始播放后，这里会显示当前曲目。',
  'queue.now.emptyTitle': '还没有正在播放的歌曲',
  'queue.now.kicker': '正在播放',
  'queue.now.quality': '音频质量',
  'queue.now.sourceFallback': '队列',
  'queue.now.waitingAudio': '等待音频信息',
  'queue.quality.unknown': '未知',
  'queue.randomSource': '随机队列',
  'queue.repeat.all': '队列',
  'queue.repeat.mode': '循环模式',
  'queue.repeat.off': '关闭',
  'queue.repeat.one': '单曲',
  'queue.tools': '队列工具',
  'queue.upNext.kicker': '接下来',
  'queue.upNext.title': '接下来播放',
  'queue.upNext.waitingCount': '{count} 首等待',
  'queue.unknownAlbum': '未知专辑',
  'queue.unknownArtist': '未知艺术家',
  'route.albums.description': '按专辑分组的封面墙。',
  'route.albums.label': '专辑',
  'route.artists.description': '按艺术家浏览。',
  'route.artists.label': '艺术家',
  'route.audioSettings.description': '输出与解码设置。',
  'route.audioSettings.label': '音频设置',
  'route.folders.description': '本地导入根目录。',
  'route.folders.label': '文件夹',
  'route.history.description': '播放历史。',
  'route.history.label': '历史',
  'route.importFile.description': '导入单个音频文件。',
  'route.importFile.label': '导入文件',
  'route.importFolder.description': '选择本地音乐文件夹。',
  'route.importFolder.label': '导入文件夹',
  'route.liked.description': '收藏曲目。',
  'route.liked.label': '喜欢',
  'route.lyricsSettings.description': '歌词偏好设置。',
  'route.lyricsSettings.label': '歌词设置',
  'route.playlists.description': '用户歌单。',
  'route.playlists.label': '歌单',
  'route.queue.description': '播放队列。',
  'route.queue.label': '队列',
  'route.remote.description': '远程来源。',
  'route.remote.label': '网盘 / 远程',
  'route.settings.description': '应用设置。',
  'route.settings.label': '设置',
  'route.songs.description': '本地曲库歌曲列表。',
  'route.songs.label': '歌曲',
  'settings.about.audioHost.description': 'echo-audio-host.exe 当前用于本地迁移验收，正式发布后走 extraResources。',
  'settings.about.audioHost.title': '音频宿主',
  'settings.about.devMode.description': '当前正在使用 ECHO Next Phase 1：Library Core + Audio Host 验收。',
  'settings.about.devMode.title': '开发模式',
  'settings.about.nativeSqlite.description': 'better-sqlite3 会在 dev 前 rebuild 到 Electron ABI，避免扫描时模块版本不匹配。',
  'settings.about.nativeSqlite.title': '原生 SQLite',
  'settings.appearance.density.compact': '紧凑',
  'settings.appearance.density.description': '曲库列表采用更紧凑的桌面密度，不再使用过大的卡片行。',
  'settings.appearance.density.standard': '标准',
  'settings.appearance.density.title': '界面密度',
  'settings.appearance.font.choose': '选择',
  'settings.appearance.font.chinese.description': '当主字体缺少中文字符时，优先使用这个中文字体补齐。',
  'settings.appearance.font.chinese.title': '中文字体',
  'settings.appearance.font.main.description': 'ECHO 默认使用 Outfit；也可以输入任意已安装字体名称。',
  'settings.appearance.font.main.title': '主字体',
  'settings.appearance.fontSize.description': '调整全局界面的基础字号。',
  'settings.appearance.fontSize.title': '基础字号',
  'settings.appearance.lineHeight.description': '调整界面文字的默认行距，让列表和说明文本更疏朗或更紧凑。',
  'settings.appearance.lineHeight.title': '界面行距',
  'settings.appearance.reset.action': '恢复默认',
  'settings.appearance.reset.description': '恢复 Outfit、默认中文字体、字号、行距与文字深浅。',
  'settings.appearance.reset.title': '外观默认值',
  'settings.appearance.textDepth.description': '调整界面文字颜色深浅；数值越低越浅。',
  'settings.appearance.textDepth.title': '文字颜色深浅',
  'settings.appearance.theme.dark': '深色',
  'settings.appearance.theme.description': '先保持浅色玻璃界面，后续再接入持久化主题设置。',
  'settings.appearance.theme.followSystem': '跟随系统',
  'settings.appearance.theme.light': '浅色',
  'settings.appearance.theme.title': '主题',
  'settings.danger.clearCache.description': '移除曲库索引、扫描记录和封面缓存，不会删除你的音乐文件或曲库文件夹。',
  'settings.danger.clearCache.title': '清空曲库缓存',
  'settings.devices.empty': 'echo-audio-host 暂未返回输出设备。',
  'settings.devices.title': '设备列表',
  'settings.general.backup.description': '导出或导入 ECHO Next 设置参数，用于迁移到新设备或恢复配置。',
  'settings.general.backup.export': '导出设置',
  'settings.general.backup.import': '导入设置',
  'settings.general.backup.title': '设置参数备份',
  'settings.general.closeToTray': '关闭时隐藏到托盘',
  'settings.general.language.description': '选择菜单、应用内设置与系统对话框的显示语言。',
  'settings.general.language.title': '显示语言',
  'settings.header.searchPlaceholder': '搜索设置...',
  'settings.integrations.discord.description': 'Phase 1 暂不接入联动服务，保留设置位置。',
  'settings.integrations.discord.title': 'Discord 状态',
  'settings.integrations.mobile.description': '未来外部设备能力会走受控 IPC，不让 Renderer 直连系统资源。',
  'settings.integrations.mobile.title': '手机遥控',
  'settings.library.network.description': '手动弱补全；本地内嵌元数据始终优先。',
  'settings.library.network.title': '网络元数据补全',
  'settings.library.networkSources.description': '选择手动修复和缺失扫描使用的补全源。',
  'settings.library.networkSources.title': '网络补全来源',
  'settings.library.networkPanel.applyMissingOnly': '仅补缺失项',
  'settings.library.networkPanel.applySelected': '应用所选',
  'settings.library.networkPanel.appliedCount': '已自动补全数量',
  'settings.library.networkPanel.artistField': '歌手',
  'settings.library.networkPanel.artistSource': '歌手来源',
  'settings.library.networkPanel.candidates': '候选',
  'settings.library.networkPanel.cover': '封面',
  'settings.library.networkPanel.embeddedCover': '内嵌封面',
  'settings.library.networkPanel.embeddedMetadata': '内嵌元数据',
  'settings.library.networkPanel.kicker': '手动修复',
  'settings.library.networkPanel.localCover': '本地',
  'settings.library.networkPanel.missingCover': '缺失/默认',
  'settings.library.networkPanel.noCandidates': '暂无网络候选。',
  'settings.library.networkPanel.providerErrors': '来源错误',
  'settings.library.networkPanel.reject': '拒绝',
  'settings.library.networkPanel.repairMissing': '修复当前曲目',
  'settings.library.networkPanel.repairThisTrack': '补全此曲',
  'settings.library.networkPanel.scanComplete': '扫描完成',
  'settings.library.networkPanel.scanMissing': '扫描缺少元数据',
  'settings.library.networkPanel.scanDone': '已扫描缺失曲目',
  'settings.library.networkPanel.scanPreparing': '准备扫描',
  'settings.library.networkPanel.scanProgress': '缺失元数据扫描进度',
  'settings.library.networkPanel.scanRunning': '正在扫描网络来源',
  'settings.library.networkPanel.showCandidates': '显示候选',
  'settings.library.networkPanel.title': '缺失元数据修复',
  'settings.library.networkPanel.titleField': '标题',
  'settings.library.networkPanel.trackId': '曲目 ID',
  'settings.library.networkPanel.trackNotFound': '找不到该曲目。请先播放一首歌，或输入曲目 ID。',
  'settings.library.networkPanel.unknownArtist': '未知歌手',
  'settings.library.networkPanel.untitled': '未命名',
  'settings.nav.about.description': '版本、更新与开发工具',
  'settings.nav.about.label': '关于 / 高级',
  'settings.nav.appearance.description': '主题、字体、背景',
  'settings.nav.appearance.label': '外观',
  'settings.nav.danger.description': '恢复与网络安全',
  'settings.nav.danger.label': '危险操作',
  'settings.nav.eq.description': '均衡器与输出安全',
  'settings.nav.eq.label': 'EQ',
  'settings.nav.general.description': '语言、窗口与基础行为',
  'settings.nav.general.label': '通用',
  'settings.nav.integrations.description': '账号登录、Discord、外部设备',
  'settings.nav.integrations.label': '联动',
  'settings.nav.library.description': '导入、扫描与清理',
  'settings.nav.library.label': '媒体库',
  'settings.nav.playback.description': '输出、缓冲与播放控制',
  'settings.nav.playback.label': '播放',
  'settings.nav.remote.description': 'NAS、WebDAV、Subsonic',
  'settings.nav.remote.label': '网盘 / 远程',
  'settings.playback.audioStatus.description': '采样率字段必须分开显示，避免旧 ECHO 独占模式 48k 锁死回归。',
  'settings.playback.audioStatus.title': '音频状态',
  'settings.playback.followCurrent.description': '开启后，切歌时会自动把左侧当前列表滚动到正在播放的歌曲位置。',
  'settings.playback.followCurrent.title': '定位当前播放歌曲',
  'settings.playback.outputDevice.description': '来自 echo-audio-host 的设备列表；没有设备时保持默认输出。',
  'settings.playback.outputDevice.empty': '无可用设备',
  'settings.playback.outputDevice.title': '输出设备',
  'settings.playback.outputMode.description': 'Shared 适合日常使用，Exclusive / ASIO 用于采样率验收和后续 bit-perfect 路径。',
  'settings.playback.outputMode.title': '输出模式',
  'settings.playback.speedMode.description': '选择播放器底部速度滑条使用的变速方式。',
  'settings.playback.speedMode.title': '变速模式',
  'settings.playback.wireless.description': '后续 HiFi 引擎阶段再接入；当前阶段不迁移 gapless / automix / 流媒体。',
  'settings.playback.wireless.title': '无线播放',
  'settings.remote.library.description': '本阶段禁止网盘 / 远程 / 流媒体，只保留设置分组占位。',
  'settings.remote.library.title': '远程音乐库',
};

const zhTW: TranslationMap = {
  ...zhCN,
  'route.albums.label': '專輯',
  'route.artists.label': '演出者',
  'route.audioSettings.label': '音訊設定',
  'route.folders.label': '資料夾',
  'route.importFile.label': '匯入檔案',
  'route.importFolder.label': '匯入資料夾',
  'route.liked.label': '喜歡',
  'route.lyricsSettings.label': '歌詞設定',
  'route.playlists.label': '播放清單',
  'route.queue.label': '佇列',
  'queue.action.clear': '清空佇列',
  'queue.action.dragLabel': '拖曳 {title}',
  'queue.action.dragTitle': '拖曳排序',
  'queue.action.generateRandom': '產生隨機佇列',
  'queue.action.generatingRandom': '產生中',
  'queue.action.like': '喜歡',
  'queue.action.more': '更多',
  'queue.action.openFolder': '打開所在資料夾',
  'queue.action.play': '立即播放 {title}',
  'queue.action.playNext': '下一首播放 {title}',
  'queue.action.remove': '移除 {title}',
  'queue.action.shuffle': '隨機播放',
  'queue.count': '{count} 首',
  'queue.empty.description': '播放歌曲、加入佇列或選擇下一首播放後，這裡會出現佇列內容。',
  'queue.empty.title': '還沒有接下來播放的歌曲',
  'queue.error.desktopBridge': '桌面橋接不可用。請在 ECHO Next 桌面端讀取曲庫。',
  'queue.error.noRandomTracks': '曲庫裡還沒有可加入隨機佇列的歌曲。',
  'queue.header.kicker': '播放佇列',
  'queue.header.title': '佇列',
  'queue.now.actions': '目前曲目操作',
  'queue.now.emptyDescription': '從歌曲或專輯開始播放後，這裡會顯示目前曲目。',
  'queue.now.emptyTitle': '還沒有正在播放的歌曲',
  'queue.now.kicker': '正在播放',
  'queue.now.quality': '音訊品質',
  'queue.now.sourceFallback': '佇列',
  'queue.now.waitingAudio': '等待音訊資訊',
  'queue.quality.unknown': '未知',
  'queue.randomSource': '隨機佇列',
  'queue.repeat.all': '佇列',
  'queue.repeat.mode': '循環模式',
  'queue.repeat.off': '關閉',
  'queue.repeat.one': '單曲',
  'queue.tools': '佇列工具',
  'queue.upNext.kicker': '接下來',
  'queue.upNext.title': '接下來播放',
  'queue.upNext.waitingCount': '{count} 首等待',
  'queue.unknownAlbum': '未知專輯',
  'queue.unknownArtist': '未知演出者',
  'route.remote.label': '網路硬碟 / 遠端',
  'route.settings.label': '設定',
  'route.songs.label': '歌曲',
  'settings.general.language.title': '顯示語言',
  'settings.general.language.description': '選擇選單、應用程式內設定與系統對話框的顯示語言。',
  'settings.header.searchPlaceholder': '搜尋設定...',
  'settings.nav.general.label': '一般',
  'settings.nav.general.description': '語言、視窗與基礎行為',
  'settings.nav.playback.label': '播放',
  'settings.nav.playback.description': '輸出、緩衝與播放控制',
  'settings.nav.integrations.label': '連動',
  'settings.nav.remote.label': '網路硬碟 / 遠端',
  'settings.nav.appearance.label': '外觀',
  'settings.nav.library.label': '媒體庫',
  'settings.nav.about.label': '關於 / 進階',
  'settings.nav.danger.label': '危險操作',
  'settings.general.closeToTray': '關閉時隱藏到系統匣',
  'settings.general.backup.title': '設定參數備份',
  'settings.general.backup.export': '匯出設定',
  'settings.general.backup.import': '匯入設定',
  'settings.playback.outputMode.title': '輸出模式',
  'settings.playback.speedMode.description': '選擇播放器底部速度滑桿使用的變速方式。',
  'settings.playback.speedMode.title': '變速模式',
  'settings.playback.outputDevice.title': '輸出裝置',
  'settings.playback.outputDevice.empty': '沒有可用裝置',
  'settings.playback.wireless.title': '無線播放',
  'settings.playback.audioStatus.title': '音訊狀態',
  'settings.integrations.discord.title': 'Discord 狀態',
  'settings.integrations.mobile.title': '手機遙控',
  'settings.remote.library.title': '遠端音樂庫',
  'settings.remote.library.description': '本階段禁止網路硬碟 / 遠端 / 串流，只保留設定分組佔位。',
  'settings.appearance.theme.title': '主題',
  'settings.appearance.theme.light': '淺色',
  'settings.appearance.theme.dark': '深色',
  'settings.appearance.theme.followSystem': '跟隨系統',
  'settings.appearance.density.title': '介面密度',
  'settings.appearance.density.compact': '緊湊',
  'settings.appearance.density.standard': '標準',
  'settings.devices.title': '裝置列表',
  'settings.devices.empty': 'echo-audio-host 暫未回傳輸出裝置。',
  'settings.danger.clearCache.title': '清空媒體庫快取',
  'common.unavailable': '暫不可用',
  'common.ready': '就緒',
  'common.checking': '檢查中',
  'common.yes': '是',
  'common.no': '否',
};

const jaJP: TranslationMap = {
  ...zhCN,
  'app.navigation.main': 'メインナビゲーション',
  'app.navigation.utility': 'ユーティリティナビゲーション',
  'app.toolbar.quickActions': 'クイック操作',
  'app.toolbar.windowControls': 'ウィンドウ操作',
  'app.window.minimize': '最小化',
  'app.window.maximize': '最大化',
  'app.window.close': '閉じる',
  'common.available': '利用可能',
  'common.build': 'ビルド',
  'common.checking': '確認中',
  'common.dev': '開発版',
  'common.disabled': '無効',
  'common.enabled': '有効',
  'common.loading': '読み込み中',
  'common.na': 'なし',
  'common.no': 'いいえ',
  'common.ready': '準備完了',
  'common.unavailable': '現在利用不可',
  'common.yes': 'はい',
  'notice.browserFolderPicker': 'ブラウザプレビューでフォルダ選択を開きました。実際のライブラリ取り込みは Electron デスクトップアプリで行います。',
  'notice.browserFilePicker': 'ブラウザプレビューで {name} を選択しました。ECHO Next デスクトップ版で Audio Core から再生してください。',
  'notice.windowControlsDesktop': 'ウィンドウ操作は Electron デスクトップウィンドウでのみ利用できます。',
  'route.albums.description': 'アルバム別のウォール表示。',
  'route.albums.label': 'アルバム',
  'route.artists.description': 'アーティスト別に閲覧。',
  'route.artists.label': 'アーティスト',
  'route.audioSettings.description': '出力とデコーダー設定。',
  'route.audioSettings.label': '音声設定',
  'route.folders.description': 'ローカル取り込み元。',
  'route.folders.label': 'フォルダ',
  'route.history.description': '再生履歴。',
  'route.history.label': '履歴',
  'route.importFile.description': '音声ファイルを 1 件取り込む。',
  'route.importFile.label': 'ファイルを取り込む',
  'route.importFolder.description': 'ローカル音楽フォルダを選択。',
  'route.importFolder.label': 'フォルダを取り込む',
  'route.liked.description': '保存した曲。',
  'route.liked.label': 'お気に入り',
  'route.lyricsSettings.description': '歌詞の設定。',
  'route.lyricsSettings.label': '歌詞設定',
  'route.playlists.description': 'ユーザープレイリスト。',
  'route.playlists.label': 'プレイリスト',
  'route.queue.description': '再生キュー。',
  'route.queue.label': 'キュー',
  'queue.action.clear': 'キューを空にする',
  'queue.action.dragLabel': '{title} をドラッグ',
  'queue.action.dragTitle': 'ドラッグして並べ替え',
  'queue.action.generateRandom': 'ランダムキューを作成',
  'queue.action.generatingRandom': '作成中',
  'queue.action.like': 'お気に入り',
  'queue.action.more': 'その他',
  'queue.action.openFolder': '保存フォルダを開く',
  'queue.action.play': '{title} を今すぐ再生',
  'queue.action.playNext': '{title} を次に再生',
  'queue.action.remove': '{title} を削除',
  'queue.action.shuffle': 'シャッフル',
  'queue.count': '{count} 曲',
  'queue.empty.description': '曲を再生、キューに追加、または次に再生を選ぶとここに表示されます。',
  'queue.empty.title': '次に再生する曲はありません',
  'queue.error.desktopBridge': 'デスクトップブリッジが利用できません。ECHO Next デスクトップ版でライブラリを読み込んでください。',
  'queue.error.noRandomTracks': 'ランダムキューに追加できる曲がライブラリにありません。',
  'queue.header.kicker': '再生キュー',
  'queue.header.title': 'キュー',
  'queue.now.actions': '現在の曲の操作',
  'queue.now.emptyDescription': '曲またはアルバムを再生すると、現在の曲がここに表示されます。',
  'queue.now.emptyTitle': '再生中の曲はありません',
  'queue.now.kicker': '再生中',
  'queue.now.quality': '音質',
  'queue.now.sourceFallback': 'キュー',
  'queue.now.waitingAudio': '音声情報を待機中',
  'queue.quality.unknown': '不明',
  'queue.randomSource': 'ランダムキュー',
  'queue.repeat.all': 'キュー',
  'queue.repeat.mode': 'リピートモード',
  'queue.repeat.off': 'オフ',
  'queue.repeat.one': '1曲',
  'queue.tools': 'キュー操作',
  'queue.upNext.kicker': '次に再生',
  'queue.upNext.title': '次の曲',
  'queue.upNext.waitingCount': '{count} 曲待機中',
  'queue.unknownAlbum': '不明なアルバム',
  'queue.unknownArtist': '不明なアーティスト',
  'route.remote.description': 'リモートソース。',
  'route.remote.label': 'クラウド / リモート',
  'route.settings.description': 'アプリ設定。',
  'route.settings.label': '設定',
  'route.songs.description': 'ローカルライブラリの曲一覧。',
  'route.songs.label': '曲',
  'settings.header.searchPlaceholder': '設定を検索...',
  'settings.nav.general.label': '一般',
  'settings.nav.general.description': '言語、ウィンドウ、基本動作',
  'settings.nav.playback.label': '再生',
  'settings.nav.playback.description': '出力、バッファ、再生操作',
  'settings.nav.integrations.label': '連携',
  'settings.nav.integrations.description': 'アカウント、Discord、外部デバイス',
  'settings.nav.remote.label': 'クラウド / リモート',
  'settings.nav.remote.description': 'NAS、WebDAV、Subsonic',
  'settings.nav.eq.label': 'EQ',
  'settings.nav.eq.description': 'イコライザーと出力保護',
  'settings.nav.appearance.label': '外観',
  'settings.nav.appearance.description': 'テーマ、フォント、背景',
  'settings.nav.library.label': 'メディアライブラリ',
  'settings.nav.library.description': '取り込み、スキャン、整理',
  'settings.nav.about.label': '情報 / 詳細',
  'settings.nav.about.description': 'バージョン、更新、開発ツール',
  'settings.nav.danger.label': '危険な操作',
  'settings.nav.danger.description': '復元とネットワーク安全性',
  'settings.general.language.title': '表示言語',
  'settings.general.language.description': 'メニュー、アプリ内設定、システムダイアログの表示言語を選択します。',
  'settings.general.closeToTray': '閉じる時にトレイへ隠す',
  'settings.general.backup.title': '設定のバックアップ',
  'settings.general.backup.description': '新しいデバイスへの移行や復元のため、ECHO Next の設定をエクスポートまたはインポートします。',
  'settings.general.backup.export': '設定を書き出す',
  'settings.general.backup.import': '設定を読み込む',
  'settings.playback.outputMode.title': '出力モード',
  'settings.playback.speedMode.description': '下部プレイヤーの速度スライダーで使う変速方式を選びます。',
  'settings.playback.speedMode.title': '変速モード',
  'settings.playback.outputMode.description': 'Shared は日常利用向け、Exclusive / ASIO はサンプルレート検証と今後の bit-perfect 経路向けです。',
  'settings.playback.outputDevice.title': '出力デバイス',
  'settings.playback.outputDevice.description': 'echo-audio-host から取得したデバイス一覧です。デバイスがない場合は既定出力を維持します。',
  'settings.playback.outputDevice.empty': '利用可能なデバイスなし',
  'settings.playback.wireless.title': 'ワイヤレス再生',
  'settings.playback.wireless.description': '今後の HiFi エンジン段階で接続します。現段階では gapless / automix / ストリーミングは移行しません。',
  'settings.playback.followCurrent.title': '再生中の曲へ移動',
  'settings.playback.followCurrent.description': '有効にすると、曲変更時に左側の現在リストを再生中の曲へ自動スクロールします。',
  'settings.playback.audioStatus.title': '音声状態',
  'settings.playback.audioStatus.description': 'サンプルレート欄を分けて表示し、旧 ECHO の排他モード 48k 固定の再発を避けます。',
  'settings.integrations.discord.title': 'Discord ステータス',
  'settings.integrations.discord.description': 'Phase 1 では連携サービスに接続せず、設定位置のみ保持します。',
  'settings.integrations.mobile.title': 'スマホリモコン',
  'settings.integrations.mobile.description': '将来の外部デバイス機能は制御された IPC を通し、Renderer がシステムリソースへ直接接続しないようにします。',
  'settings.remote.library.title': 'リモート音楽ライブラリ',
  'settings.remote.library.description': 'この段階ではクラウド / リモート / ストリーミングを禁止し、設定グループの場所だけ残します。',
  'settings.appearance.theme.title': 'テーマ',
  'settings.appearance.theme.description': 'まずはライトなガラス UI を維持し、永続テーマ設定は後続で接続します。',
  'settings.appearance.theme.light': 'ライト',
  'settings.appearance.theme.dark': 'ダーク',
  'settings.appearance.theme.followSystem': 'システムに合わせる',
  'settings.appearance.density.title': '表示密度',
  'settings.appearance.density.description': 'ライブラリ一覧はよりコンパクトなデスクトップ密度を使い、大きすぎるカード行は使いません。',
  'settings.appearance.density.compact': 'コンパクト',
  'settings.appearance.density.standard': '標準',
  'settings.devices.title': 'デバイス一覧',
  'settings.devices.empty': 'echo-audio-host から出力デバイスがまだ返っていません。',
  'settings.about.devMode.title': '開発モード',
  'settings.about.devMode.description': '現在 ECHO Next Phase 1: Library Core + Audio Host の検証中です。',
  'settings.about.nativeSqlite.title': 'ネイティブ SQLite',
  'settings.about.nativeSqlite.description': 'better-sqlite3 は dev 前に Electron ABI へ rebuild し、スキャン時のモジュール不一致を避けます。',
  'settings.about.audioHost.title': '音声ホスト',
  'settings.about.audioHost.description': 'echo-audio-host.exe は現在ローカル移行検証用です。正式リリース後は extraResources に含めます。',
  'settings.danger.clearCache.title': 'ライブラリキャッシュを消去',
  'settings.danger.clearCache.description': 'ライブラリ索引、スキャン履歴、カバーキャッシュを削除します。音楽ファイルやライブラリフォルダーは削除しません。',
};

const enUS: TranslationMap = {
  ...zhCN,
  'app.navigation.main': 'Main navigation',
  'app.navigation.utility': 'Utility navigation',
  'app.toolbar.quickActions': 'Quick actions',
  'app.toolbar.windowControls': 'Window controls',
  'app.window.minimize': 'Minimize',
  'app.window.maximize': 'Maximize',
  'app.window.close': 'Close',
  'common.available': 'Available',
  'common.build': 'Build',
  'common.checking': 'Checking',
  'common.dev': 'Dev',
  'common.disabled': 'Disabled',
  'common.enabled': 'Enabled',
  'common.loading': 'Loading',
  'common.na': 'n/a',
  'common.no': 'No',
  'common.ready': 'Ready',
  'common.unavailable': 'Unavailable',
  'common.yes': 'Yes',
  'notice.browserFolderPicker': 'Browser preview opened a folder picker. Real library import uses the Electron desktop app.',
  'notice.browserFilePicker': 'Browser preview selected {name}. Open ECHO Next desktop to play it through Audio Core.',
  'notice.windowControlsDesktop': 'Window controls are available in the Electron desktop window.',
  'route.albums.description': 'Grouped album wall.',
  'route.albums.label': 'Albums',
  'route.artists.description': 'Browse by artist.',
  'route.artists.label': 'Artists',
  'route.audioSettings.description': 'Output and decoder settings.',
  'route.audioSettings.label': 'Audio Settings',
  'route.folders.description': 'Local import roots.',
  'route.folders.label': 'Folders',
  'route.history.description': 'Playback history.',
  'route.history.label': 'History',
  'route.importFile.description': 'Import a single audio file.',
  'route.importFile.label': 'Import File',
  'route.importFolder.description': 'Choose a local music folder.',
  'route.importFolder.label': 'Import Folder',
  'route.liked.description': 'Saved tracks.',
  'route.liked.label': 'Liked',
  'route.lyricsSettings.description': 'Lyrics preferences.',
  'route.lyricsSettings.label': 'Lyrics Settings',
  'route.playlists.description': 'User playlists.',
  'route.playlists.label': 'Playlists',
  'route.queue.description': 'Playback queue.',
  'route.queue.label': 'Queue',
  'queue.action.clear': 'Clear queue',
  'queue.action.dragLabel': 'Drag {title}',
  'queue.action.dragTitle': 'Drag to reorder',
  'queue.action.generateRandom': 'Generate random queue',
  'queue.action.generatingRandom': 'Generating',
  'queue.action.like': 'Like',
  'queue.action.more': 'More',
  'queue.action.openFolder': 'Open containing folder',
  'queue.action.play': 'Play {title}',
  'queue.action.playNext': 'Play next {title}',
  'queue.action.remove': 'Remove {title}',
  'queue.action.shuffle': 'Shuffle',
  'queue.count': '{count} tracks',
  'queue.empty.description': 'Play a song, add to queue, or choose play next to fill this list.',
  'queue.empty.title': 'No upcoming tracks',
  'queue.error.desktopBridge': 'Desktop bridge unavailable. Open ECHO Next desktop to read the library.',
  'queue.error.noRandomTracks': 'Your library does not have any tracks for a random queue yet.',
  'queue.header.kicker': 'Playback Queue',
  'queue.header.title': 'Queue',
  'queue.now.actions': 'Current track actions',
  'queue.now.emptyDescription': 'Start a track or album to build the queue.',
  'queue.now.emptyTitle': 'Nothing is playing',
  'queue.now.kicker': 'Now Playing',
  'queue.now.quality': 'Audio quality',
  'queue.now.sourceFallback': 'Queue',
  'queue.now.waitingAudio': 'Waiting for audio info',
  'queue.quality.unknown': 'Unknown',
  'queue.randomSource': 'Random queue',
  'queue.repeat.all': 'Queue',
  'queue.repeat.mode': 'Repeat mode',
  'queue.repeat.off': 'Off',
  'queue.repeat.one': 'One',
  'queue.tools': 'Queue tools',
  'queue.upNext.kicker': 'Up Next',
  'queue.upNext.title': 'Upcoming tracks',
  'queue.upNext.waitingCount': '{count} waiting',
  'queue.unknownAlbum': 'Unknown album',
  'queue.unknownArtist': 'Unknown artist',
  'route.remote.description': 'Remote sources.',
  'route.remote.label': 'Cloud / Remote',
  'route.settings.description': 'Application settings.',
  'route.settings.label': 'Settings',
  'route.songs.description': 'Local library song list.',
  'route.songs.label': 'Songs',
  'settings.header.searchPlaceholder': 'Search settings...',
  'settings.nav.general.label': 'General',
  'settings.nav.general.description': 'Language, window, and basic behavior',
  'settings.nav.playback.label': 'Playback',
  'settings.nav.playback.description': 'Output, buffering, and playback controls',
  'settings.nav.integrations.label': 'Integrations',
  'settings.nav.integrations.description': 'Accounts, Discord, external devices',
  'settings.nav.remote.label': 'Cloud / Remote',
  'settings.nav.remote.description': 'NAS, WebDAV, Subsonic',
  'settings.nav.eq.label': 'EQ',
  'settings.nav.eq.description': 'Equalizer and output safety',
  'settings.nav.appearance.label': 'Appearance',
  'settings.nav.appearance.description': 'Theme, font, background',
  'settings.nav.library.label': 'Media Library',
  'settings.nav.library.description': 'Import, scan, and cleanup',
  'settings.nav.about.label': 'About / Advanced',
  'settings.nav.about.description': 'Version, updates, and developer tools',
  'settings.nav.danger.label': 'Danger Zone',
  'settings.nav.danger.description': 'Recovery and network safety',
  'settings.general.language.title': 'Display Language',
  'settings.general.language.description': 'Choose the language used by menus, in-app settings, and system dialogs.',
  'settings.general.closeToTray': 'Hide to tray on close',
  'settings.general.backup.title': 'Settings Backup',
  'settings.general.backup.description': 'Export or import ECHO Next settings for migration or recovery.',
  'settings.general.backup.export': 'Export Settings',
  'settings.general.backup.import': 'Import Settings',
  'settings.playback.outputMode.title': 'Output Mode',
  'settings.playback.speedMode.description': 'Choose the mode used by the speed slider in the player bar.',
  'settings.playback.speedMode.title': 'Speed Mode',
  'settings.playback.outputMode.description': 'Shared is for everyday listening. Exclusive / ASIO are for sample-rate validation and future bit-perfect paths.',
  'settings.playback.outputDevice.title': 'Output Device',
  'settings.playback.outputDevice.description': 'Device list from echo-audio-host. When no device is available, default output is kept.',
  'settings.playback.outputDevice.empty': 'No available devices',
  'settings.playback.wireless.title': 'Wireless Playback',
  'settings.playback.wireless.description': 'This will connect in a later HiFi engine phase. The current phase does not migrate gapless / automix / streaming.',
  'settings.playback.followCurrent.title': 'Follow Current Track',
  'settings.playback.followCurrent.description': 'When enabled, the current list scrolls to the playing track after track changes.',
  'settings.playback.audioStatus.title': 'Audio Status',
  'settings.playback.audioStatus.description': 'Sample-rate fields stay separated to prevent the old ECHO exclusive-mode 48k lock regression.',
  'settings.integrations.discord.title': 'Discord Status',
  'settings.integrations.discord.description': 'Phase 1 does not connect integration services yet; this setting keeps the slot reserved.',
  'settings.integrations.mobile.title': 'Mobile Remote',
  'settings.integrations.mobile.description': 'Future external-device features will go through controlled IPC instead of direct Renderer system access.',
  'settings.library.network.description': 'Manual weak completion only; local embedded metadata always keeps priority.',
  'settings.library.network.title': 'Network Metadata Completion',
  'settings.library.networkSources.description': 'Choose providers used by manual repair and missing-metadata scans.',
  'settings.library.networkSources.title': 'Network Completion Sources',
  'settings.library.networkPanel.applyMissingOnly': 'Apply missing only',
  'settings.library.networkPanel.applySelected': 'Apply selected',
  'settings.library.networkPanel.appliedCount': 'Auto-applied count',
  'settings.library.networkPanel.artistField': 'Artist',
  'settings.library.networkPanel.artistSource': 'Artist source',
  'settings.library.networkPanel.candidates': 'Candidates',
  'settings.library.networkPanel.cover': 'Cover',
  'settings.library.networkPanel.embeddedCover': 'Embedded cover',
  'settings.library.networkPanel.embeddedMetadata': 'Embedded metadata',
  'settings.library.networkPanel.kicker': 'Manual repair',
  'settings.library.networkPanel.localCover': 'Local',
  'settings.library.networkPanel.missingCover': 'Missing/default',
  'settings.library.networkPanel.noCandidates': 'No network candidate yet.',
  'settings.library.networkPanel.providerErrors': 'Provider errors',
  'settings.library.networkPanel.reject': 'Reject',
  'settings.library.networkPanel.repairMissing': 'Repair current track',
  'settings.library.networkPanel.repairThisTrack': 'Repair this track',
  'settings.library.networkPanel.scanComplete': 'Scan complete',
  'settings.library.networkPanel.scanMissing': 'Scan Missing Metadata',
  'settings.library.networkPanel.scanDone': 'Scanned missing tracks',
  'settings.library.networkPanel.scanPreparing': 'Preparing scan',
  'settings.library.networkPanel.scanProgress': 'Missing metadata scan progress',
  'settings.library.networkPanel.scanRunning': 'Scanning network providers',
  'settings.library.networkPanel.showCandidates': 'Show Candidates',
  'settings.library.networkPanel.title': 'Missing Metadata Repair',
  'settings.library.networkPanel.titleField': 'Title',
  'settings.library.networkPanel.trackId': 'Track id',
  'settings.library.networkPanel.trackNotFound': 'Track not found. Play a track first, or enter a track ID.',
  'settings.library.networkPanel.unknownArtist': 'Unknown Artist',
  'settings.library.networkPanel.untitled': 'Untitled',
  'settings.remote.library.title': 'Remote Music Library',
  'settings.remote.library.description': 'Cloud / remote / streaming sources are blocked in this phase; only the settings group remains.',
  'settings.appearance.theme.title': 'Theme',
  'settings.appearance.theme.description': 'Keep the light glass interface for now; persistent themes will be connected later.',
  'settings.appearance.theme.light': 'Light',
  'settings.appearance.theme.dark': 'Dark',
  'settings.appearance.theme.followSystem': 'Follow System',
  'settings.appearance.density.title': 'Interface Density',
  'settings.appearance.density.description': 'Library lists use a tighter desktop density instead of oversized card rows.',
  'settings.appearance.density.compact': 'Compact',
  'settings.appearance.density.standard': 'Standard',
  'settings.appearance.font.choose': 'Choose',
  'settings.appearance.font.chinese.description': 'Used first when the main font does not include Chinese glyphs.',
  'settings.appearance.font.chinese.title': 'Chinese Font',
  'settings.appearance.font.main.description': 'ECHO uses Outfit by default. You can enter any installed font family.',
  'settings.appearance.font.main.title': 'Main Font',
  'settings.appearance.fontSize.description': 'Adjust the base size used by the interface.',
  'settings.appearance.fontSize.title': 'Base Font Size',
  'settings.appearance.lineHeight.description': 'Adjust default UI text spacing for denser or airier reading.',
  'settings.appearance.lineHeight.title': 'Interface Line Height',
  'settings.appearance.reset.action': 'Reset',
  'settings.appearance.reset.description': 'Restore Outfit, the default Chinese font, base size, line height, and text depth.',
  'settings.appearance.reset.title': 'Appearance Defaults',
  'settings.appearance.textDepth.description': 'Adjust interface text darkness. Lower values make text lighter.',
  'settings.appearance.textDepth.title': 'Text Depth',
  'settings.devices.title': 'Device List',
  'settings.devices.empty': 'echo-audio-host has not returned output devices yet.',
  'settings.about.devMode.title': 'Developer Mode',
  'settings.about.devMode.description': 'Currently validating ECHO Next Phase 1: Library Core + Audio Host.',
  'settings.about.nativeSqlite.title': 'Native SQLite',
  'settings.about.nativeSqlite.description': 'better-sqlite3 is rebuilt to the Electron ABI before dev to avoid module mismatches during scanning.',
  'settings.about.audioHost.title': 'Audio Host',
  'settings.about.audioHost.description': 'echo-audio-host.exe is currently used for local migration validation. Production builds will ship it through extraResources.',
  'settings.danger.clearCache.title': 'Clear Library Cache',
  'settings.danger.clearCache.description': 'Removes the library index, scan records, and cover cache without deleting music files or library folders.',
};

export const translations: Record<Locale, TranslationMap> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'ja-JP': jaJP,
  'en-US': enUS,
};

export const isLocale = (value: string | null): value is Locale => {
  return value === 'zh-CN' || value === 'zh-TW' || value === 'ja-JP' || value === 'en-US';
};
