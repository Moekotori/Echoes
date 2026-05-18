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
  | 'audioDrawer.action.close'
  | 'audioDrawer.action.copiedDiagnostics'
  | 'audioDrawer.action.copyDiagnostics'
  | 'audioDrawer.action.hideDevice'
  | 'audioDrawer.action.openAsioPanel'
  | 'audioDrawer.action.resetEngine'
  | 'audioDrawer.action.resetEngineBusy'
  | 'audioDrawer.action.resetEngineDone'
  | 'audioDrawer.action.restore'
  | 'audioDrawer.asioLatency.description'
  | 'audioDrawer.asioLatency.recommended'
  | 'audioDrawer.asioLatency.status'
  | 'audioDrawer.asioLatency.value'
  | 'audioDrawer.asioRoutes.title'
  | 'audioDrawer.badge.bitPerfectReady'
  | 'audioDrawer.badge.dspActive'
  | 'audioDrawer.badge.juceFallback'
  | 'audioDrawer.badge.juceOutput'
  | 'audioDrawer.badge.resampling'
  | 'audioDrawer.badge.soxrResampler'
  | 'audioDrawer.badge.speedUp'
  | 'audioDrawer.buffer.asio'
  | 'audioDrawer.buffer.auto'
  | 'audioDrawer.buffer.collapsedDescription'
  | 'audioDrawer.buffer.default'
  | 'audioDrawer.buffer.latencyProfile'
  | 'audioDrawer.buffer.low'
  | 'audioDrawer.buffer.profileDefault'
  | 'audioDrawer.buffer.safer'
  | 'audioDrawer.buffer.stable'
  | 'audioDrawer.buffer.title'
  | 'audioDrawer.buffer.ultraLow'
  | 'audioDrawer.device.asioDriver'
  | 'audioDrawer.device.lowLatency'
  | 'audioDrawer.device.selected'
  | 'audioDrawer.device.systemAudio'
  | 'audioDrawer.device.systemDefault'
  | 'audioDrawer.device.systemDefaultOutput'
  | 'audioDrawer.device.systemOutput'
  | 'audioDrawer.device.systemSelectedRoute'
  | 'audioDrawer.empty.asioDevices'
  | 'audioDrawer.empty.hiddenDevices'
  | 'audioDrawer.empty.systemDevices'
  | 'audioDrawer.error.desktopBridgeUnavailable'
  | 'audioDrawer.meter.direct'
  | 'audioDrawer.meter.chain'
  | 'audioDrawer.meter.mode'
  | 'audioDrawer.meter.output'
  | 'audioDrawer.meter.rate'
  | 'audioDrawer.meter.resample'
  | 'audioDrawer.meter.source'
  | 'audioDrawer.meter.latency'
  | 'audioDrawer.guard.asioUnavailable.description'
  | 'audioDrawer.guard.asioUnavailable.title'
  | 'audioDrawer.guard.soxrFallback.description'
  | 'audioDrawer.guard.soxrFallback.title'
  | 'audioDrawer.latency.balanced'
  | 'audioDrawer.latency.balancedDetail'
  | 'audioDrawer.latency.lowLatency'
  | 'audioDrawer.latency.lowLatencyDetail'
  | 'audioDrawer.latency.stable'
  | 'audioDrawer.latency.stableDetail'
  | 'audioDrawer.mode.exclusive'
  | 'audioDrawer.mode.exclusiveCandidate'
  | 'audioDrawer.mode.directSound'
  | 'audioDrawer.mode.shared'
  | 'audioDrawer.note.asio'
  | 'audioDrawer.note.asioWarning'
  | 'audioDrawer.note.outputResponsibilityPrimary'
  | 'audioDrawer.note.outputResponsibilitySecondary'
  | 'audioDrawer.note.outputResponsibilityTitle'
  | 'audioDrawer.note.currentOutput'
  | 'audioDrawer.note.engine'
  | 'audioDrawer.note.juceOutput'
  | 'audioDrawer.note.juceDecode'
  | 'audioDrawer.note.dsdDop'
  | 'audioDrawer.note.asioNativeDsd'
  | 'audioDrawer.note.releaseExclusiveOnPause'
  | 'audioDrawer.option.juceOutput'
  | 'audioDrawer.option.juceDecode'
  | 'audioDrawer.option.dsdDop'
  | 'audioDrawer.option.asioNativeDsd'
  | 'audioDrawer.option.releaseExclusiveOnPause'
  | 'audioDrawer.option.active'
  | 'audioDrawer.option.set'
  | 'audioDrawer.option.automix'
  | 'audioDrawer.option.automixActive'
  | 'audioDrawer.option.automixDescription'
  | 'audioDrawer.option.rememberOutput'
  | 'audioDrawer.option.rememberOutputDescription'
  | 'audioDrawer.option.showAsioPanelSettings'
  | 'audioDrawer.option.showAsioPanelSettingsDescription'
  | 'audioDrawer.option.directSound'
  | 'audioDrawer.option.directSoundDescription'
  | 'audioDrawer.option.sharedBackend'
  | 'audioDrawer.option.wasapiShared'
  | 'audioDrawer.option.wasapiSharedDescription'
  | 'audioDrawer.option.wasapiExclusive'
  | 'audioDrawer.option.wasapiExclusiveDescription'
  | 'audioDrawer.section.advancedOutput'
  | 'audioDrawer.section.automix'
  | 'audioDrawer.section.asioDevices'
  | 'audioDrawer.section.currentOutput'
  | 'audioDrawer.section.hiddenDevices'
  | 'audioDrawer.section.systemDevices'
  | 'audioDrawer.signal.balanceDsp'
  | 'audioDrawer.signal.bitPerfect'
  | 'audioDrawer.signal.dspOn'
  | 'audioDrawer.signal.eqOff'
  | 'audioDrawer.signal.eqOn'
  | 'audioDrawer.signal.asioSdkOutput'
  | 'audioDrawer.signal.ffmpegDecode'
  | 'audioDrawer.signal.dsdDop'
  | 'audioDrawer.signal.dsdDopFallback'
  | 'audioDrawer.signal.dsdDopStandby'
  | 'audioDrawer.signal.juceDecode'
  | 'audioDrawer.signal.juceDecodeFallback'
  | 'audioDrawer.signal.juceDecodeStandby'
  | 'audioDrawer.signal.nativeRate'
  | 'audioDrawer.signal.noActiveSource'
  | 'audioDrawer.signal.pending'
  | 'audioDrawer.signal.processed'
  | 'audioDrawer.signal.sharedMixer'
  | 'audioDrawer.signal.standardPath'
  | 'audioDrawer.status.noTrack'
  | 'audioDrawer.status.ratePending'
  | 'audioDrawer.status.sampleRatePending'
  | 'audioDrawer.title'
  | 'audioDrawer.todo.outputControls'
  | 'audioDrawer.todo.outputControlsDescription'
  | 'audioDrawer.troubleshooting.description'
  | 'audioDrawer.troubleshooting.hardAction'
  | 'audioDrawer.troubleshooting.hardBusy'
  | 'audioDrawer.troubleshooting.hardConfirm'
  | 'audioDrawer.troubleshooting.hardDone'
  | 'audioDrawer.troubleshooting.softAction'
  | 'audioDrawer.troubleshooting.softBusy'
  | 'audioDrawer.troubleshooting.softDone'
  | 'audioDrawer.troubleshooting.title'
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
  | 'library.action.refresh'
  | 'library.albums.card.tracks'
  | 'library.albums.error.desktopBridge'
  | 'library.albums.listAria'
  | 'library.albums.loading'
  | 'library.albums.searchPlaceholder'
  | 'library.albums.sort.aria'
  | 'library.albums.sort.artist'
  | 'library.albums.sort.titleAsc'
  | 'library.albums.sort.titleDesc'
  | 'library.albums.title'
  | 'library.artists.error.desktopBridge'
  | 'library.artists.avatarPriority'
  | 'library.artists.listAria'
  | 'library.artists.loading'
  | 'library.artists.meta.albums'
  | 'library.artists.meta.noTracks'
  | 'library.artists.meta.tracks'
  | 'library.artists.searchPlaceholder'
  | 'library.artists.sort.aria'
  | 'library.artists.sort.frequent'
  | 'library.artists.sort.nameAsc'
  | 'library.artists.sort.nameDesc'
  | 'library.artists.title'
  | 'library.count.total'
  | 'library.sort.createdAsc'
  | 'library.sort.createdDesc'
  | 'library.sort.default'
  | 'library.sort.durationAsc'
  | 'library.sort.durationDesc'
  | 'library.sort.fileModifiedAsc'
  | 'library.sort.fileModifiedDesc'
  | 'library.sort.random'
  | 'library.sort.recent'
  | 'library.source.aria'
  | 'library.source.local'
  | 'library.source.remote'
  | 'trackMenu.action.addToPlaylist'
  | 'trackMenu.action.playNext'
  | 'trackMenu.action.addToQueue'
  | 'trackMenu.action.like'
  | 'trackMenu.action.unlike'
  | 'trackMenu.action.removeFromQueue'
  | 'trackMenu.action.openOsuTiming'
  | 'trackMenu.action.editTags'
  | 'trackMenu.action.reloadEmbeddedTags'
  | 'trackMenu.action.goToAlbum'
  | 'trackMenu.action.showInFolder'
  | 'trackMenu.action.copyPath'
  | 'trackMenu.action.openSystem'
  | 'trackMenu.action.copyNameArtist'
  | 'trackMenu.action.copyCover'
  | 'trackMenu.action.saveCover'
  | 'trackMenu.action.deleteSong'
  | 'folders.action.addScan'
  | 'folders.action.browse'
  | 'folders.action.cancel'
  | 'folders.action.open'
  | 'folders.action.play'
  | 'folders.action.queue'
  | 'folders.action.random'
  | 'folders.action.refresh'
  | 'folders.action.remove'
  | 'folders.action.scan'
  | 'folders.confirm.deleteTrack'
  | 'folders.confirm.removeRoot'
  | 'folders.count.tracks'
  | 'folders.detail.importHint'
  | 'folders.detail.libraryFolders'
  | 'folders.detail.root'
  | 'folders.detail.selectFolder'
  | 'folders.detail.subfolder'
  | 'folders.duration.hours'
  | 'folders.duration.hoursMinutes'
  | 'folders.duration.minutes'
  | 'folders.empty.noScan'
  | 'folders.empty.roots'
  | 'folders.error.actionFailed'
  | 'folders.error.desktopEditTags'
  | 'folders.error.desktopFileActions'
  | 'folders.error.desktopImport'
  | 'folders.error.desktopManage'
  | 'folders.error.noCoverSaved'
  | 'folders.error.noCoverToCopy'
  | 'folders.error.notFolder'
  | 'folders.error.pathMissing'
  | 'folders.error.permission'
  | 'folders.error.trackActionUnavailable'
  | 'folders.filters.includeSubfolders'
  | 'folders.filters.label'
  | 'folders.filters.searchPlaceholder'
  | 'folders.message.addedToPlaylist'
  | 'folders.message.alreadyScanning'
  | 'folders.message.folderAddedScanStarted'
  | 'folders.message.folderRemoved'
  | 'folders.message.loadedPartial'
  | 'folders.message.loadedTracks'
  | 'folders.message.noPlayableTracks'
  | 'folders.message.queuedTracks'
  | 'folders.message.scanCancelled'
  | 'folders.message.scanStarted'
  | 'folders.metrics.duration'
  | 'folders.metrics.label'
  | 'folders.metrics.size'
  | 'folders.metrics.subfolders'
  | 'folders.metrics.tracks'
  | 'folders.panel.addFolder'
  | 'folders.panel.import'
  | 'folders.panel.manage'
  | 'folders.panel.scan'
  | 'folders.panel.selectedRoot'
  | 'folders.panel.status'
  | 'folders.phase.checkingCache'
  | 'folders.phase.discovering'
  | 'folders.phase.extractingCovers'
  | 'folders.phase.finished'
  | 'folders.phase.groupingAlbums'
  | 'folders.phase.readingMetadata'
  | 'folders.phase.writingDatabase'
  | 'folders.prompt.choosePlaylist'
  | 'folders.prompt.createPlaylist'
  | 'folders.queueSource.recursive'
  | 'folders.scan.progress'
  | 'folders.sidebar.kicker'
  | 'folders.sidebar.title'
  | 'folders.sort.album'
  | 'folders.sort.artist'
  | 'folders.sort.duration'
  | 'folders.sort.quality'
  | 'folders.sort.random'
  | 'folders.sort.recent'
  | 'folders.sort.title'
  | 'folders.status.cancelled'
  | 'folders.status.completed'
  | 'folders.status.failed'
  | 'folders.status.queued'
  | 'folders.status.running'
  | 'folders.statusLine.loadingTracks'
  | 'folders.statusLine.preparingQueue'
  | 'notice.browserFolderPicker'
  | 'notice.browserFilePicker'
  | 'notice.windowControlsDesktop'
  | 'queue.action.clear'
  | 'queue.action.dragLabel'
  | 'queue.action.dragTitle'
  | 'queue.action.generateRandom'
  | 'queue.action.generateFromHistory'
  | 'queue.action.generatingHistory'
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
  | 'queue.error.noHistoryTracks'
  | 'queue.error.noRandomTracks'
  | 'queue.header.kicker'
  | 'queue.header.title'
  | 'queue.historySource'
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
  | 'route.connect.description'
  | 'route.connect.label'
  | 'route.downloads.description'
  | 'route.downloads.label'
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
  | 'route.lyrics.description'
  | 'route.lyrics.label'
  | 'route.lyricsSettings.description'
  | 'route.lyricsSettings.label'
  | 'route.mvSettings.description'
  | 'route.mvSettings.label'
  | 'mvSettings.action.chooseFile'
  | 'mvSettings.action.close'
  | 'mvSettings.action.collapseNetwork'
  | 'mvSettings.action.dragReorder'
  | 'mvSettings.action.dragSource'
  | 'mvSettings.action.expandNetwork'
  | 'mvSettings.action.findLocal'
  | 'mvSettings.action.openExternal'
  | 'mvSettings.action.refresh'
  | 'mvSettings.action.removeSelected'
  | 'mvSettings.action.searchNetwork'
  | 'mvSettings.aria.candidates'
  | 'mvSettings.aria.drawer'
  | 'mvSettings.aria.engineStatus'
  | 'mvSettings.aria.maxQuality'
  | 'mvSettings.aria.maxQualityOptions'
  | 'mvSettings.aria.networkSources'
  | 'mvSettings.aria.selectedQuality'
  | 'mvSettings.aria.selectedQualityOptions'
  | 'mvSettings.badge.credentialsMain'
  | 'mvSettings.badge.proxyOnly'
  | 'mvSettings.binding.selectedMv'
  | 'mvSettings.binding.title'
  | 'mvSettings.candidate.external'
  | 'mvSettings.candidate.inApp'
  | 'mvSettings.custom.apply'
  | 'mvSettings.custom.description'
  | 'mvSettings.custom.directDash'
  | 'mvSettings.custom.input'
  | 'mvSettings.custom.placeholder'
  | 'mvSettings.custom.playing'
  | 'mvSettings.custom.title'
  | 'mvSettings.custom.videoTitle'
  | 'mvSettings.engine.mvTitle'
  | 'mvSettings.engine.network'
  | 'mvSettings.engine.quality'
  | 'mvSettings.engine.selected'
  | 'mvSettings.engine.title'
  | 'mvSettings.error.noActiveTrackBinding'
  | 'mvSettings.error.noActiveTrackMatching'
  | 'mvSettings.error.noActiveTrackNetworkSearch'
  | 'mvSettings.error.noLocalCandidates'
  | 'mvSettings.error.noNetworkCandidates'
  | 'mvSettings.general.enabled'
  | 'mvSettings.immersive.blur'
  | 'mvSettings.immersive.brightness'
  | 'mvSettings.immersive.description'
  | 'mvSettings.immersive.dragHint'
  | 'mvSettings.immersive.lyricsReadability'
  | 'mvSettings.immersive.lyricsReadabilityDescription'
  | 'mvSettings.immersive.overlay'
  | 'mvSettings.immersive.overlayHint'
  | 'mvSettings.immersive.positionX'
  | 'mvSettings.immersive.positionY'
  | 'mvSettings.immersive.reset'
  | 'mvSettings.immersive.title'
  | 'mvSettings.immersive.visualHint'
  | 'mvSettings.immersive.zoom'
  | 'mvSettings.network.autoApply'
  | 'mvSettings.network.autoApplyThreshold'
  | 'mvSettings.network.autoApplyThresholdDescription'
  | 'mvSettings.network.autoPreload'
  | 'mvSettings.network.autoPreloadDescription'
  | 'mvSettings.network.maxQuality'
  | 'mvSettings.network.replayAudioOnChange'
  | 'mvSettings.network.replayAudioOnChangeDescription'
  | 'mvSettings.network.restartAudioOnLoad'
  | 'mvSettings.network.restartAudioOnLoadDescription'
  | 'mvSettings.network.title'
  | 'mvSettings.offset.aria'
  | 'mvSettings.offset.description'
  | 'mvSettings.offset.earlier'
  | 'mvSettings.offset.later'
  | 'mvSettings.offset.reset'
  | 'mvSettings.offset.title'
  | 'mvSettings.provider.local'
  | 'mvSettings.quality.max'
  | 'mvSettings.search.input'
  | 'mvSettings.search.placeholder'
  | 'mvSettings.search.useCurrentSong'
  | 'mvSettings.status.auto'
  | 'mvSettings.status.noActiveTrack'
  | 'mvSettings.status.none'
  | 'mvSettings.status.off'
  | 'mvSettings.status.on'
  | 'mvSettings.title'
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
  | 'settings.appearance.artistAvatars.action.clear'
  | 'settings.appearance.artistAvatars.action.queueing'
  | 'settings.appearance.artistAvatars.action.refreshMissing'
  | 'settings.appearance.artistAvatars.description'
  | 'settings.appearance.artistAvatars.fallback'
  | 'settings.appearance.artistAvatars.message.cleared'
  | 'settings.appearance.artistAvatars.message.desktopBridgeClear'
  | 'settings.appearance.artistAvatars.message.desktopBridgeRefresh'
  | 'settings.appearance.artistAvatars.message.enableFirst'
  | 'settings.appearance.artistAvatars.message.queued'
  | 'settings.appearance.artistAvatars.title'
  | 'settings.appearance.artistAvatars.toggle'
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
  | 'settings.appearance.themePreset.berryDream'
  | 'settings.appearance.themePreset.berryDream.description'
  | 'settings.appearance.themePreset.classic'
  | 'settings.appearance.themePreset.classic.description'
  | 'settings.appearance.themePreset.amberNoir'
  | 'settings.appearance.themePreset.amberNoir.description'
  | 'settings.appearance.themePreset.caramelPudding'
  | 'settings.appearance.themePreset.caramelPudding.description'
  | 'settings.appearance.themePreset.cottonCloud'
  | 'settings.appearance.themePreset.cottonCloud.description'
  | 'settings.appearance.themePreset.darkSideMoon'
  | 'settings.appearance.themePreset.darkSideMoon.description'
  | 'settings.appearance.themePreset.description'
  | 'settings.appearance.themePreset.echoTwilight'
  | 'settings.appearance.themePreset.echoTwilight.description'
  | 'settings.appearance.themePreset.graphiteAurora'
  | 'settings.appearance.themePreset.graphiteAurora.description'
  | 'settings.appearance.themePreset.lemonMochi'
  | 'settings.appearance.themePreset.lemonMochi.description'
  | 'settings.appearance.themePreset.matchaCream'
  | 'settings.appearance.themePreset.matchaCream.description'
  | 'settings.appearance.themePreset.melonCream'
  | 'settings.appearance.themePreset.melonCream.description'
  | 'settings.appearance.themePreset.mintCandy'
  | 'settings.appearance.themePreset.mintCandy.description'
  | 'settings.appearance.themePreset.neonCandy'
  | 'settings.appearance.themePreset.neonCandy.description'
  | 'settings.appearance.themePreset.nyanCat'
  | 'settings.appearance.themePreset.nyanCat.description'
  | 'settings.appearance.themePreset.oceanStudio'
  | 'settings.appearance.themePreset.oceanStudio.description'
  | 'settings.appearance.themePreset.peachSoda'
  | 'settings.appearance.themePreset.peachSoda.description'
  | 'settings.appearance.themePreset.seaSaltJelly'
  | 'settings.appearance.themePreset.seaSaltJelly.description'
  | 'settings.appearance.themePreset.sakuraMilk'
  | 'settings.appearance.themePreset.sakuraMilk.description'
  | 'settings.appearance.themePreset.strawberryCookie'
  | 'settings.appearance.themePreset.strawberryCookie.description'
  | 'settings.appearance.themePreset.rosewoodVinyl'
  | 'settings.appearance.themePreset.rosewoodVinyl.description'
  | 'settings.appearance.themePreset.shibuyaNight'
  | 'settings.appearance.themePreset.shibuyaNight.description'
  | 'settings.appearance.themePreset.kyotoKurenai'
  | 'settings.appearance.themePreset.kyotoKurenai.description'
  | 'settings.appearance.themePreset.ukiyoIndigo'
  | 'settings.appearance.themePreset.ukiyoIndigo.description'
  | 'settings.appearance.themePreset.fujiSnow'
  | 'settings.appearance.themePreset.fujiSnow.description'
  | 'settings.appearance.themePreset.matsuriLantern'
  | 'settings.appearance.themePreset.matsuriLantern.description'
  | 'settings.appearance.themePreset.ginzaNoir'
  | 'settings.appearance.themePreset.ginzaNoir.description'
  | 'settings.appearance.themePreset.frostJazz'
  | 'settings.appearance.themePreset.frostJazz.description'
  | 'settings.appearance.themePreset.title'
  | 'settings.appearance.themePreset.wisteriaBubble'
  | 'settings.appearance.themePreset.wisteriaBubble.description'
  | 'settings.appearance.themeCustom.action.autoFix'
  | 'settings.appearance.themeCustom.action.export'
  | 'settings.appearance.themeCustom.action.import'
  | 'settings.appearance.themeCustom.action.reset'
  | 'settings.appearance.themeCustom.action.save'
  | 'settings.appearance.themeCustom.advanced.hide'
  | 'settings.appearance.themeCustom.advanced.show'
  | 'settings.appearance.themeCustom.description'
  | 'settings.appearance.themeCustom.field.accent'
  | 'settings.appearance.themeCustom.field.accent.description'
  | 'settings.appearance.themeCustom.field.accentStrong'
  | 'settings.appearance.themeCustom.field.accentStrong.description'
  | 'settings.appearance.themeCustom.field.appBg'
  | 'settings.appearance.themeCustom.field.appBg.description'
  | 'settings.appearance.themeCustom.field.appBg2'
  | 'settings.appearance.themeCustom.field.appBg2.description'
  | 'settings.appearance.themeCustom.field.appBg3'
  | 'settings.appearance.themeCustom.field.appBg3.description'
  | 'settings.appearance.themeCustom.field.border'
  | 'settings.appearance.themeCustom.field.border.description'
  | 'settings.appearance.themeCustom.field.buttonText'
  | 'settings.appearance.themeCustom.field.buttonText.description'
  | 'settings.appearance.themeCustom.field.glass'
  | 'settings.appearance.themeCustom.field.glass.description'
  | 'settings.appearance.themeCustom.field.heading'
  | 'settings.appearance.themeCustom.field.heading.description'
  | 'settings.appearance.themeCustom.field.muted'
  | 'settings.appearance.themeCustom.field.muted.description'
  | 'settings.appearance.themeCustom.field.onAccent'
  | 'settings.appearance.themeCustom.field.onAccent.description'
  | 'settings.appearance.themeCustom.field.panel'
  | 'settings.appearance.themeCustom.field.panel.description'
  | 'settings.appearance.themeCustom.field.panelOpacity'
  | 'settings.appearance.themeCustom.field.panelOpacity.description'
  | 'settings.appearance.themeCustom.field.panelSoft'
  | 'settings.appearance.themeCustom.field.panelSoft.description'
  | 'settings.appearance.themeCustom.field.secondary'
  | 'settings.appearance.themeCustom.field.secondary.description'
  | 'settings.appearance.themeCustom.field.shadow'
  | 'settings.appearance.themeCustom.field.shadow.description'
  | 'settings.appearance.themeCustom.field.text'
  | 'settings.appearance.themeCustom.field.text.description'
  | 'settings.appearance.themeCustom.group.advanced'
  | 'settings.appearance.themeCustom.group.advanced.description'
  | 'settings.appearance.themeCustom.group.core'
  | 'settings.appearance.themeCustom.group.core.description'
  | 'settings.appearance.themeCustom.group.gradient'
  | 'settings.appearance.themeCustom.group.gradient.description'
  | 'settings.appearance.themeCustom.message.fixed'
  | 'settings.appearance.themeCustom.message.exported'
  | 'settings.appearance.themeCustom.message.imported'
  | 'settings.appearance.themeCustom.message.importFailed'
  | 'settings.appearance.themeCustom.message.invalidColor'
  | 'settings.appearance.themeCustom.message.lowContrast'
  | 'settings.appearance.themeCustom.message.reset'
  | 'settings.appearance.themeCustom.message.saved'
  | 'settings.appearance.themeCustom.preview.description'
  | 'settings.appearance.themeCustom.preview.title'
  | 'settings.appearance.themeCustom.title'
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
  | 'settings.integrations.discord.action.refresh'
  | 'settings.integrations.discord.title'
  | 'settings.integrations.smtc.description'
  | 'settings.integrations.smtc.title'
  | 'settings.integrations.lastfm.action.completeAuth'
  | 'settings.integrations.lastfm.action.connect'
  | 'settings.integrations.lastfm.action.disconnect'
  | 'settings.integrations.lastfm.action.refresh'
  | 'settings.integrations.lastfm.activeProgress'
  | 'settings.integrations.lastfm.activeTrack'
  | 'settings.integrations.lastfm.connection.description'
  | 'settings.integrations.lastfm.connection.title'
  | 'settings.integrations.lastfm.description'
  | 'settings.integrations.lastfm.lastNowPlaying'
  | 'settings.integrations.lastfm.lastScrobble'
  | 'settings.integrations.lastfm.never'
  | 'settings.integrations.lastfm.noActiveTrack'
  | 'settings.integrations.lastfm.nowPlaying.description'
  | 'settings.integrations.lastfm.nowPlaying.title'
  | 'settings.integrations.lastfm.scrobbling.description'
  | 'settings.integrations.lastfm.scrobbling.title'
  | 'settings.integrations.lastfm.status.connected'
  | 'settings.integrations.lastfm.status.error'
  | 'settings.integrations.lastfm.status.notConnected'
  | 'settings.integrations.lastfm.status.pending'
  | 'settings.integrations.lastfm.statusLabel'
  | 'settings.integrations.lastfm.title'
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
  | 'settings.eq.action.autoPreamp'
  | 'settings.eq.action.bypass'
  | 'settings.eq.action.delete'
  | 'settings.eq.action.duplicatePreset'
  | 'settings.eq.action.freqDown'
  | 'settings.eq.action.freqFineDown'
  | 'settings.eq.action.freqFineUp'
  | 'settings.eq.action.freqUp'
  | 'settings.eq.action.holdBypass'
  | 'settings.eq.action.hideAdvanced'
  | 'settings.eq.action.applyA'
  | 'settings.eq.action.applyB'
  | 'settings.eq.action.applySafePreamp'
  | 'settings.eq.action.overwrite'
  | 'settings.eq.action.redo'
  | 'settings.eq.action.resetBand'
  | 'settings.eq.action.resetAllGains'
  | 'settings.eq.action.resetChannelBalance'
  | 'settings.eq.action.resetEq'
  | 'settings.eq.action.resetFrequencies'
  | 'settings.eq.action.resetMonitorTools'
  | 'settings.eq.action.resetSelected'
  | 'settings.eq.action.resetTrimsOnly'
  | 'settings.eq.action.revertUserPreset'
  | 'settings.eq.action.save'
  | 'settings.eq.action.saveAs'
  | 'settings.eq.action.showAdvanced'
  | 'settings.eq.action.storeA'
  | 'settings.eq.action.storeB'
  | 'settings.eq.action.toggleBypassOff'
  | 'settings.eq.action.toggleBypassOn'
  | 'settings.eq.action.undo'
  | 'settings.eq.action.unlockFrequency'
  | 'settings.eq.ab.emptySlot'
  | 'settings.eq.ab.loudnessMatched'
  | 'settings.eq.ab.summary'
  | 'settings.eq.ab.title'
  | 'settings.eq.band.fallback'
  | 'settings.eq.band.frequency'
  | 'settings.eq.band.frequencyStepper'
  | 'settings.eq.band.frequencySnapped'
  | 'settings.eq.band.frequencyUnlocked'
  | 'settings.eq.band.gain'
  | 'settings.eq.band.gainStepper'
  | 'settings.eq.band.inspector'
  | 'settings.eq.band.readoutsAria'
  | 'settings.eq.bitPerfect.channelDisabled'
  | 'settings.eq.bitPerfect.disabled'
  | 'settings.eq.bitPerfect.readyPath'
  | 'settings.eq.bitPerfect.sourceBoth'
  | 'settings.eq.bitPerfect.sourceChannel'
  | 'settings.eq.bitPerfect.sourceEq'
  | 'settings.eq.channel.active'
  | 'settings.eq.channel.balance'
  | 'settings.eq.channel.bypassed'
  | 'settings.eq.channel.center'
  | 'settings.eq.channel.calibrationMode'
  | 'settings.eq.channel.constantPower'
  | 'settings.eq.channel.description'
  | 'settings.eq.channel.dsp'
  | 'settings.eq.channel.effectiveLeft'
  | 'settings.eq.channel.effectiveRight'
  | 'settings.eq.channel.group.balance'
  | 'settings.eq.channel.group.gainTrim'
  | 'settings.eq.channel.group.monitorTools'
  | 'settings.eq.channel.group.phaseTools'
  | 'settings.eq.channel.invertLeft'
  | 'settings.eq.channel.invertRight'
  | 'settings.eq.channel.leftGain'
  | 'settings.eq.channel.leftTotal'
  | 'settings.eq.channel.mono.left'
  | 'settings.eq.channel.mono.off'
  | 'settings.eq.channel.mono.right'
  | 'settings.eq.channel.mono.sum'
  | 'settings.eq.channel.monoMode'
  | 'settings.eq.channel.quick.leftSolo'
  | 'settings.eq.channel.quick.monoCheck'
  | 'settings.eq.channel.quick.phaseCheck'
  | 'settings.eq.channel.quick.rightSolo'
  | 'settings.eq.channel.quick.swapCheck'
  | 'settings.eq.channel.quickTools'
  | 'settings.eq.channel.rightGain'
  | 'settings.eq.channel.rightTotal'
  | 'settings.eq.channel.swap'
  | 'settings.eq.channel.title'
  | 'settings.eq.curve.aria'
  | 'settings.eq.curve.dragBand'
  | 'settings.eq.curve.fineEdit'
  | 'settings.eq.curve.freeFrequency'
  | 'settings.eq.curve.snapped'
  | 'settings.eq.error.bridgeChannelBalance'
  | 'settings.eq.error.bridgeControlEq'
  | 'settings.eq.error.bridgeDeletePreset'
  | 'settings.eq.error.bridgeSavePreset'
  | 'settings.eq.error.presetName'
  | 'settings.eq.level.clips'
  | 'settings.eq.level.estimatedOutputPeak'
  | 'settings.eq.level.headroom'
  | 'settings.eq.level.inputPeak'
  | 'settings.eq.level.inputRms'
  | 'settings.eq.level.sourceEstimate'
  | 'settings.eq.preamp.aria'
  | 'settings.eq.preamp.inputSafety'
  | 'settings.eq.preamp.maxBoost'
  | 'settings.eq.preamp.metricsAria'
  | 'settings.eq.preamp.recommended'
  | 'settings.eq.preamp.safeHeadroom'
  | 'settings.eq.preset.builtIn'
  | 'settings.eq.preset.approximation'
  | 'settings.eq.preset.copyName'
  | 'settings.eq.preset.filter.all'
  | 'settings.eq.preset.filter.builtIn'
  | 'settings.eq.preset.filter.genre'
  | 'settings.eq.preset.filter.target'
  | 'settings.eq.preset.filter.user'
  | 'settings.eq.preset.filter.utility'
  | 'settings.eq.preset.filterAria'
  | 'settings.eq.preset.meta.approximationCaution'
  | 'settings.eq.preset.meta.genrePurpose'
  | 'settings.eq.preset.meta.genreScenario'
  | 'settings.eq.preset.meta.targetPurpose'
  | 'settings.eq.preset.meta.targetScenario'
  | 'settings.eq.preset.meta.tasteCaution'
  | 'settings.eq.preset.meta.type.animeJpop'
  | 'settings.eq.preset.meta.type.bassBoost'
  | 'settings.eq.preset.meta.type.bkRoomCurve'
  | 'settings.eq.preset.meta.type.broadcastVoice'
  | 'settings.eq.preset.meta.type.classicSmiley'
  | 'settings.eq.preset.meta.type.classical'
  | 'settings.eq.preset.meta.type.diffuseField'
  | 'settings.eq.preset.meta.type.flat'
  | 'settings.eq.preset.meta.type.harmanInEar'
  | 'settings.eq.preset.meta.type.harmanTarget'
  | 'settings.eq.preset.meta.type.headphoneWarm'
  | 'settings.eq.preset.meta.type.loudness'
  | 'settings.eq.preset.meta.type.night'
  | 'settings.eq.preset.meta.type.rock'
  | 'settings.eq.preset.meta.type.studioNeutral'
  | 'settings.eq.preset.meta.type.trebleSparkle'
  | 'settings.eq.preset.meta.type.vinylWarmth'
  | 'settings.eq.preset.meta.type.vocalClear'
  | 'settings.eq.preset.meta.utilityCaution'
  | 'settings.eq.preset.meta.utilityPurpose'
  | 'settings.eq.preset.meta.utilityScenario'
  | 'settings.eq.preset.modified'
  | 'settings.eq.preset.nameAria'
  | 'settings.eq.preset.readonly'
  | 'settings.eq.preset.savePlaceholder'
  | 'settings.eq.preset.searchAria'
  | 'settings.eq.preset.searchPlaceholder'
  | 'settings.eq.preset.selectorAria'
  | 'settings.eq.preset.user'
  | 'settings.eq.state.eqDisabled'
  | 'settings.eq.state.eqEnabled'
  | 'settings.eq.status.bitPerfect'
  | 'settings.eq.status.clippingRisk'
  | 'settings.eq.status.eq'
  | 'settings.eq.status.estimatedPeak'
  | 'settings.eq.status.headroom'
  | 'settings.eq.status.preamp'
  | 'settings.eq.status.preset'
  | 'settings.eq.status.safe'
  | 'settings.eq.status.safeHeadroomShort'
  | 'settings.eq.status.warning'
  | 'settings.eq.subtitle'
  | 'settings.eq.title'
  | 'settings.eq.warning.channelClipping'
  | 'settings.eq.warning.lowerPreamp'
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
  | 'settings.nav.shortcuts.description'
  | 'settings.nav.shortcuts.label'
  | 'settings.playback.audioStatus.description'
  | 'settings.playback.audioStatus.title'
  | 'settings.playback.automix.description'
  | 'settings.playback.automix.title'
  | 'settings.playback.followCurrent.description'
  | 'settings.playback.followCurrent.title'
  | 'settings.playback.outputDevice.description'
  | 'settings.playback.outputDevice.empty'
  | 'settings.playback.outputDevice.title'
  | 'settings.playback.outputMode.description'
  | 'settings.playback.outputMode.title'
  | 'settings.playback.sharedBackend.description'
  | 'settings.playback.sharedBackend.directSound'
  | 'settings.playback.sharedBackend.title'
  | 'settings.playback.sharedBackend.wasapi'
  | 'settings.playback.resetEngine.action'
  | 'settings.playback.resetEngine.busy'
  | 'settings.playback.resetEngine.description'
  | 'settings.playback.resetEngine.done'
  | 'settings.playback.resetEngine.title'
  | 'settings.playback.troubleshooting.description'
  | 'settings.playback.troubleshooting.hardAction'
  | 'settings.playback.troubleshooting.hardBusy'
  | 'settings.playback.troubleshooting.hardConfirm'
  | 'settings.playback.troubleshooting.hardDone'
  | 'settings.playback.troubleshooting.softAction'
  | 'settings.playback.troubleshooting.softBusy'
  | 'settings.playback.troubleshooting.softDone'
  | 'settings.playback.troubleshooting.title'
  | 'settings.playback.speedMode.description'
  | 'settings.playback.speedMode.title'
  | 'settings.playback.stability.action.copied'
  | 'settings.playback.stability.action.copy'
  | 'settings.playback.stability.action.refresh'
  | 'settings.playback.stability.error.desktopBridgeUnavailable'
  | 'settings.playback.stability.field.lastSharedStabilityRecoveryAt'
  | 'settings.playback.stability.field.lastWatchdogRecoveryTime'
  | 'settings.playback.stability.field.nativeBufferedFrames'
  | 'settings.playback.stability.field.nativeBufferedMs'
  | 'settings.playback.stability.field.nativeDeviceBufferFrames'
  | 'settings.playback.stability.field.nativeFifoCapacityFrames'
  | 'settings.playback.stability.field.nativeStartupPrebufferFrames'
  | 'settings.playback.stability.field.nativeUnderrunCallbacks'
  | 'settings.playback.stability.field.nativeUnderrunFrames'
  | 'settings.playback.stability.field.recentWatchdogRecoveryCount'
  | 'settings.playback.stability.field.sharedStabilityTier'
  | 'settings.playback.stability.field.watchdogStatus'
  | 'settings.playback.stability.title'
  | 'settings.playback.stability.value.unknown'
  | 'settings.playback.wireless.description'
  | 'settings.playback.wireless.title'
  | 'settings.shortcuts.action.clear'
  | 'settings.shortcuts.action.bossKey.description'
  | 'settings.shortcuts.action.bossKey.title'
  | 'settings.shortcuts.action.nextTrack.description'
  | 'settings.shortcuts.action.nextTrack.title'
  | 'settings.shortcuts.action.openAudioSettings.description'
  | 'settings.shortcuts.action.openAudioSettings.title'
  | 'settings.shortcuts.action.openLyricsSettings.description'
  | 'settings.shortcuts.action.openLyricsSettings.title'
  | 'settings.shortcuts.action.openMvSettings.description'
  | 'settings.shortcuts.action.openMvSettings.title'
  | 'settings.shortcuts.action.playPause.description'
  | 'settings.shortcuts.action.playPause.title'
  | 'settings.shortcuts.action.previousTrack.description'
  | 'settings.shortcuts.action.previousTrack.title'
  | 'settings.shortcuts.action.record'
  | 'settings.shortcuts.action.restoreRecommended'
  | 'settings.shortcuts.action.seekBackward.description'
  | 'settings.shortcuts.action.seekBackward.title'
  | 'settings.shortcuts.action.seekForward.description'
  | 'settings.shortcuts.action.seekForward.title'
  | 'settings.shortcuts.action.showMainWindow.description'
  | 'settings.shortcuts.action.showMainWindow.title'
  | 'settings.shortcuts.action.speedDown.description'
  | 'settings.shortcuts.action.speedDown.title'
  | 'settings.shortcuts.action.speedUp.description'
  | 'settings.shortcuts.action.speedUp.title'
  | 'settings.shortcuts.action.stop.description'
  | 'settings.shortcuts.action.stop.title'
  | 'settings.shortcuts.action.volumeDown.description'
  | 'settings.shortcuts.action.volumeDown.title'
  | 'settings.shortcuts.action.volumeUp.description'
  | 'settings.shortcuts.action.volumeUp.title'
  | 'settings.shortcuts.description'
  | 'settings.shortcuts.empty'
  | 'settings.shortcuts.message.duplicate'
  | 'settings.shortcuts.message.empty'
  | 'settings.shortcuts.message.invalid'
  | 'settings.shortcuts.message.safe'
  | 'settings.shortcuts.message.unavailable'
  | 'settings.shortcuts.message.unsafe'
  | 'settings.shortcuts.note'
  | 'settings.shortcuts.recording'
  | 'settings.shortcuts.title'
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
  'audioDrawer.action.close': '关闭音频设置',
  'audioDrawer.action.copiedDiagnostics': '已复制播放诊断信息',
  'audioDrawer.action.copyDiagnostics': '复制播放诊断信息',
  'audioDrawer.action.hideDevice': '隐藏设备',
  'audioDrawer.action.openAsioPanel': '打开 ASIO 面板',
  'audioDrawer.action.resetEngine': '重置音频引擎',
  'audioDrawer.action.resetEngineBusy': '正在重置音频引擎',
  'audioDrawer.action.resetEngineDone': '音频引擎已重置',
  'audioDrawer.action.restore': '恢复',
  'audioDrawer.asioLatency.description': '根据当前打开的缓冲估算输出端会多等多久再播放。数值越低越跟手，数值越高越稳、越不容易爆音。',
  'audioDrawer.asioLatency.recommended': '推荐延迟',
  'audioDrawer.asioLatency.status': '请求 {requested} frames / 已打开 {opened} frames',
  'audioDrawer.asioLatency.value': '{value} ms',
  'audioDrawer.asioRoutes.title': 'ASIO 输出通道',
  'audioDrawer.badge.bitPerfectReady': 'Bit-perfect ready',
  'audioDrawer.badge.dspActive': 'DSP active',
  'audioDrawer.badge.juceFallback': 'JUCE 已降级',
  'audioDrawer.badge.juceOutput': 'JUCE 输出',
  'audioDrawer.badge.resampling': 'Resampling',
  'audioDrawer.badge.soxrResampler': 'SOXR',
  'audioDrawer.badge.speedUp': 'Speed Up',
  'audioDrawer.buffer.asio': 'ASIO 缓冲',
  'audioDrawer.buffer.auto': '自动',
  'audioDrawer.buffer.collapsedDescription': '默认收起；点开可调整延迟档位和 ASIO 缓冲。',
  'audioDrawer.buffer.default': '默认',
  'audioDrawer.buffer.latencyProfile': '延迟档位',
  'audioDrawer.buffer.low': '低',
  'audioDrawer.buffer.profileDefault': '跟随档位默认',
  'audioDrawer.buffer.safer': '更稳',
  'audioDrawer.buffer.stable': '稳定',
  'audioDrawer.buffer.title': '缓冲设置',
  'audioDrawer.buffer.ultraLow': '超低延迟',
  'audioDrawer.device.asioDriver': 'ASIO 驱动',
  'audioDrawer.device.lowLatency': '低延迟',
  'audioDrawer.device.selected': '已选择',
  'audioDrawer.device.systemAudio': '系统音频',
  'audioDrawer.device.systemDefault': '系统默认',
  'audioDrawer.device.systemDefaultOutput': '系统默认输出',
  'audioDrawer.device.systemOutput': '系统输出',
  'audioDrawer.device.systemSelectedRoute': '系统选择的路径',
  'audioDrawer.empty.asioDevices': '没有找到 ASIO 输出设备。',
  'audioDrawer.empty.hiddenDevices': '没有隐藏设备。',
  'audioDrawer.empty.systemDevices': '没有找到系统输出设备。',
  'audioDrawer.error.desktopBridgeUnavailable': '桌面桥接不可用',
  'audioDrawer.meter.direct': '直通',
  'audioDrawer.meter.chain': '链路',
  'audioDrawer.meter.mode': '模式',
  'audioDrawer.meter.output': '输出',
  'audioDrawer.meter.rate': '采样率',
  'audioDrawer.meter.resample': '重采样',
  'audioDrawer.meter.source': '音源',
  'audioDrawer.meter.latency': '延迟',
  'audioDrawer.guard.asioUnavailable.description': '默认关闭。遇到 No device found 后会短暂跳过同一个 ASIO 设备，并改用安全的共享输出。',
  'audioDrawer.guard.asioUnavailable.title': 'ASIO 不可用保护',
  'audioDrawer.guard.soxrFallback.description': '默认开启。如果共享 SOXR 重采样在 PCM 开始前不可用，会回退到 FFmpeg 默认重采样。',
  'audioDrawer.guard.soxrFallback.title': 'SOXR 回退保护',
  'audioDrawer.latency.balanced': '均衡',
  'audioDrawer.latency.balancedDetail': '2048 frames',
  'audioDrawer.latency.lowLatency': '低延迟',
  'audioDrawer.latency.lowLatencyDetail': '切歌更快 / 不稳升均衡',
  'audioDrawer.latency.stable': '稳定',
  'audioDrawer.latency.stableDetail': '8192 frames',
  'audioDrawer.mode.exclusive': '独占',
  'audioDrawer.mode.exclusiveCandidate': '独占候选',
  'audioDrawer.mode.directSound': 'DirectSound 兼容',
  'audioDrawer.mode.shared': '共享',
  'audioDrawer.note.asio': '低延迟专业音频接口，需要驱动支持。',
  'audioDrawer.note.asioWarning': '开启 ASIO 会占用您的音频通道；如果没有原厂或可信 ASIO 驱动，请不要使用，也不建议为了适配 ASIO 安装来路不明的虚拟驱动，收益有限且可能导致不稳定。',
  'audioDrawer.note.outputResponsibilityTitle': '独占 / ASIO 使用提示',
  'audioDrawer.note.outputResponsibilityPrimary': '如果您直推耳机或音响，通常没有开启独占的必要。如果非要开启独占 / ASIO 后出现问题，而共享模式正常，请先排查 DAC、声卡、驱动和连接链路，不要一遇到就直接判断为软件 Bug；如果嫌麻烦，建议使用独立解码设备。',
  'audioDrawer.note.outputResponsibilitySecondary': '如果使用独立解码后仍有问题，请到 设置 - 播放 重置引擎；若仍无法解决，请在群聊发送错误报告。',
  'audioDrawer.note.currentOutput': '这里显示现在真正使用的输出路径；共享适合日常，ASIO 和 WASAPI 独占会以金色标出。',
  'audioDrawer.note.engine': '这里快速查看输出设备、模式、采样率、EQ 和重采样状态。',
  'audioDrawer.note.juceOutput': '默认主输出。FFmpeg 继续负责解码；JUCE 负责输出，失败会自动回退到兼容路径。',
  'audioDrawer.note.juceDecode': '默认关闭。本地 WAV/FLAC/MP3 在无需重采样时尝试 JUCE 解码；MP3 走 Windows Media，失败会自动回退 FFmpeg。',
  'audioDrawer.note.dsdDop': '默认关闭。本地 DSF 在独占或 ASIO 下尝试 DoP 直出；失败会自动回退 FFmpeg PCM，最终以 DAC 显示为准。',
  'audioDrawer.note.asioNativeDsd': '默认关闭。仅 ASIO + 本地 DSF + DoP 开启且无 EQ/音量/变速/DSP 时尝试；失败会退回现有 DoP/PCM。',
  'audioDrawer.note.releaseExclusiveOnPause': '实验功能。暂停时释放 WASAPI 独占，让其它软件临时出声；恢复播放会重新抢独占，失败时临时降到共享。',
  'audioDrawer.option.juceOutput': 'JUCE 主输出',
  'audioDrawer.option.juceDecode': 'JUCE 解码试验',
  'audioDrawer.option.dsdDop': 'DSD DoP 直出试验',
  'audioDrawer.option.asioNativeDsd': 'ASIO 原生 DSD 实验',
  'audioDrawer.option.releaseExclusiveOnPause': '暂停释放独占实验',
  'audioDrawer.option.active': '开启',
  'audioDrawer.option.set': '设置',
  'audioDrawer.option.automix': '启用 Automix',
  'audioDrawer.option.automixActive': '当前播放已进入 Automix 预混路径。',
  'audioDrawer.option.automixDescription': '默认关闭。开启后会在队列连续播放时自动把当前歌曲尾段与下一首重叠淡入淡出。',
  'audioDrawer.option.rememberOutput': '保存输出设置',
  'audioDrawer.option.rememberOutputDescription': '下次启动时恢复所选输出设备、输出模式和缓冲等参数。',
  'audioDrawer.option.showAsioPanelSettings': '是否显示 ASIO 面板设置',
  'audioDrawer.option.showAsioPanelSettingsDescription': '默认关闭。开启后才在 ASIO 设备下显示“打开 ASIO 面板”按钮。',
  'audioDrawer.option.directSound': 'DirectSound 兼容',
  'audioDrawer.option.directSoundDescription': '手动兼容模式，延迟较大；只在 WASAPI 播放异常时尝试。',
  'audioDrawer.option.sharedBackend': '共享后端',
  'audioDrawer.option.wasapiShared': 'WASAPI Shared',
  'audioDrawer.option.wasapiSharedDescription': '日常 Windows 共享输出路径。',
  'audioDrawer.option.wasapiExclusive': 'WASAPI 独占模式',
  'audioDrawer.option.wasapiExclusiveDescription': '共享是日常 Windows 输出路径。独占会请求同一设备并绕过共享混音器，只建议在确认 DAC/声卡和驱动稳定时使用；Realtek 等板载驱动兼容性较差，可能导致无声、卡顿或切换失败。',
  'audioDrawer.section.advancedOutput': '高级输出',
  'audioDrawer.section.automix': 'Automix',
  'audioDrawer.section.asioDevices': 'ASIO 输出设备',
  'audioDrawer.section.currentOutput': '当前输出',
  'audioDrawer.section.hiddenDevices': '隐藏设备',
  'audioDrawer.section.systemDevices': '系统输出设备',
  'audioDrawer.signal.balanceDsp': 'Balance DSP',
  'audioDrawer.signal.bitPerfect': 'Bit-perfect',
  'audioDrawer.signal.dspOn': 'DSP On',
  'audioDrawer.signal.eqOff': 'EQ Off',
  'audioDrawer.signal.eqOn': 'EQ On',
  'audioDrawer.signal.asioSdkOutput': 'ASIO SDK 输出',
  'audioDrawer.signal.ffmpegDecode': 'FFmpeg 解码',
  'audioDrawer.signal.dsdDop': 'DSF bitstream -> DoP',
  'audioDrawer.signal.dsdDopFallback': 'DSD DoP 已降级',
  'audioDrawer.signal.dsdDopStandby': 'DoP 未适用',
  'audioDrawer.signal.juceDecode': 'JUCE 解码',
  'audioDrawer.signal.juceDecodeFallback': 'JUCE 解码已降级',
  'audioDrawer.signal.juceDecodeStandby': 'JUCE 解码未适用',
  'audioDrawer.signal.nativeRate': '原生采样率',
  'audioDrawer.signal.noActiveSource': '没有活跃音源',
  'audioDrawer.signal.pending': '等待中',
  'audioDrawer.signal.processed': '已处理',
  'audioDrawer.signal.sharedMixer': '共享混音器',
  'audioDrawer.signal.standardPath': '标准路径',
  'audioDrawer.status.noTrack': '没有曲目',
  'audioDrawer.status.ratePending': '采样率待定',
  'audioDrawer.status.sampleRatePending': '采样率待定',
  'audioDrawer.title': '音频设置',
  'audioDrawer.todo.outputControls': '目标采样率和缓冲控制',
  'audioDrawer.todo.outputControlsDescription': 'TODO：等 DeviceService 暴露安全控制后接入真实音频设置。',
  'audioDrawer.troubleshooting.description': '如果声音卡住或设备列表不正常，点这里。软重启不会影响其他应用。',
  'audioDrawer.troubleshooting.hardAction': '重启 Windows 音频服务',
  'audioDrawer.troubleshooting.hardBusy': '正在重启 Windows 音频服务',
  'audioDrawer.troubleshooting.hardConfirm': '这会中断所有应用的声音（Chrome、游戏、通话），并需要管理员权限。是否继续？',
  'audioDrawer.troubleshooting.hardDone': 'Windows 音频服务已恢复，你可以重新开始播放',
  'audioDrawer.troubleshooting.softAction': '重启音频引擎',
  'audioDrawer.troubleshooting.softBusy': '正在重启音频引擎',
  'audioDrawer.troubleshooting.softDone': '音频引擎已重启，你可以重新开始播放',
  'audioDrawer.troubleshooting.title': '音频故障排除',
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
  'library.action.refresh': '刷新',
  'library.albums.card.tracks': '{count} 首歌',
  'library.albums.error.desktopBridge': '桌面桥接不可用。请在 ECHO Next 桌面版中读取专辑。',
  'library.albums.listAria': '专辑列表',
  'library.albums.loading': '正在加载专辑...',
  'library.albums.searchPlaceholder': '搜索专辑 / 艺术家',
  'library.albums.sort.aria': '专辑排序',
  'library.albums.sort.artist': '艺术家',
  'library.albums.sort.titleAsc': '标题 A-Z',
  'library.albums.sort.titleDesc': '标题 Z-A',
  'library.albums.title': '专辑',
  'library.artists.error.desktopBridge': '桌面桥接不可用。请在 ECHO Next 桌面版中读取艺术家。',
  'library.artists.avatarPriority': '头像优先',
  'library.artists.listAria': '艺术家列表',
  'library.artists.loading': '正在加载艺术家...',
  'library.artists.meta.albums': '{count} 张专辑',
  'library.artists.meta.noTracks': '暂无歌曲',
  'library.artists.meta.tracks': '{count} 首歌',
  'library.artists.searchPlaceholder': '搜索艺术家',
  'library.artists.sort.aria': '艺术家排序',
  'library.artists.sort.frequent': '歌曲最多',
  'library.artists.sort.nameAsc': '名称 A-Z',
  'library.artists.sort.nameDesc': '名称 Z-A',
  'library.artists.title': '艺术家',
  'library.count.total': '共 {count} 个',
  'library.sort.createdAsc': '创建最早',
  'library.sort.createdDesc': '创建最新',
  'library.sort.default': '默认',
  'library.sort.durationAsc': '时长最短',
  'library.sort.durationDesc': '时长最长',
  'library.sort.fileModifiedAsc': '文件修改最早',
  'library.sort.fileModifiedDesc': '文件修改最新',
  'library.sort.random': '随机',
  'library.sort.recent': '最近',
  'library.source.aria': '曲库来源',
  'library.source.local': '本地',
  'library.source.remote': '网盘',
  'trackMenu.action.addToPlaylist': '加入歌单...',
  'trackMenu.action.playNext': '下一首播放',
  'trackMenu.action.addToQueue': '加入队列',
  'trackMenu.action.like': '喜欢',
  'trackMenu.action.unlike': '取消喜欢',
  'trackMenu.action.removeFromQueue': '从播放队列移除',
  'trackMenu.action.openOsuTiming': 'osu! Timing',
  'trackMenu.action.editTags': '编辑标签',
  'trackMenu.action.reloadEmbeddedTags': '重新加载嵌入标签',
  'trackMenu.action.goToAlbum': '定位到专辑',
  'trackMenu.action.showInFolder': '在文件夹中显示',
  'trackMenu.action.copyPath': '复制文件路径',
  'trackMenu.action.openSystem': '使用系统默认应用打开',
  'trackMenu.action.copyNameArtist': '复制歌名与艺术家',
  'trackMenu.action.copyCover': '复制歌曲卡片图片',
  'trackMenu.action.saveCover': '保存歌曲卡片图片',
  'trackMenu.action.deleteSong': '删除歌曲',
  'folders.action.addScan': '添加并扫描',
  'folders.action.browse': '浏览',
  'folders.action.cancel': '取消',
  'folders.action.open': '打开',
  'folders.action.play': '播放',
  'folders.action.queue': '加入队列',
  'folders.action.random': '随机',
  'folders.action.refresh': '刷新文件夹',
  'folders.action.remove': '移除',
  'folders.action.scan': '扫描',
  'folders.confirm.deleteTrack': '删除这个音乐文件？\n{title}',
  'folders.confirm.removeRoot': '从曲库索引中移除“{name}”？音乐文件会保留在磁盘上。',
  'folders.count.tracks': '{count} 首',
  'folders.detail.importHint': '导入音乐文件夹后，可以按路径浏览曲库。',
  'folders.detail.libraryFolders': '曲库文件夹',
  'folders.detail.root': '根目录',
  'folders.detail.selectFolder': '选择文件夹',
  'folders.detail.subfolder': '子文件夹',
  'folders.duration.hours': '{count} 小时',
  'folders.duration.hoursMinutes': '{hours} 小时 {minutes} 分钟',
  'folders.duration.minutes': '{count} 分钟',
  'folders.empty.noScan': '这个根目录还没有运行过扫描。',
  'folders.empty.roots': '还没有曲库文件夹。',
  'folders.error.actionFailed': '文件夹操作失败。',
  'folders.error.desktopEditTags': '桌面桥接不可用。请在 ECHO Next 桌面端编辑内嵌标签。',
  'folders.error.desktopFileActions': '桌面桥接不可用。请在 ECHO Next 桌面端使用文件操作。',
  'folders.error.desktopImport': '桌面桥接不可用。请在 ECHO Next 桌面端导入文件夹。',
  'folders.error.desktopManage': '桌面桥接不可用。请在 ECHO Next 桌面端管理文件夹。',
  'folders.error.noCoverSaved': '没有保存任何封面。',
  'folders.error.noCoverToCopy': '这首歌没有可复制的封面。',
  'folders.error.notFolder': '选择的路径不是文件夹。',
  'folders.error.pathMissing': '文件夹路径不存在。',
  'folders.error.permission': 'ECHO 没有权限访问这个文件夹。',
  'folders.error.trackActionUnavailable': '这个歌曲操作暂不可用。',
  'folders.filters.includeSubfolders': '包含子文件夹',
  'folders.filters.label': '文件夹歌曲筛选',
  'folders.filters.searchPlaceholder': '搜索此文件夹...',
  'folders.message.addedToPlaylist': '已添加到歌单：{name}',
  'folders.message.alreadyScanning': '这个曲库根目录正在扫描。',
  'folders.message.folderAddedScanStarted': '文件夹已添加，扫描已在后台开始。',
  'folders.message.folderRemoved': '文件夹已从曲库索引中移除。',
  'folders.message.loadedPartial': '已载入前 {loaded} / {total} 首，避免占用过多内存。',
  'folders.message.loadedTracks': '已载入 {count} 首。',
  'folders.message.noPlayableTracks': '这个文件夹里没有可播放歌曲。',
  'folders.message.queuedTracks': '已加入队列 {count} 首。',
  'folders.message.scanCancelled': '扫描已取消。',
  'folders.message.scanStarted': '扫描已开始。',
  'folders.metrics.duration': '时长',
  'folders.metrics.label': '文件夹指标',
  'folders.metrics.size': '大小',
  'folders.metrics.subfolders': '子文件夹',
  'folders.metrics.tracks': '歌曲',
  'folders.panel.addFolder': '添加文件夹',
  'folders.panel.import': '导入',
  'folders.panel.manage': '管理',
  'folders.panel.scan': '扫描',
  'folders.panel.selectedRoot': '已选根目录',
  'folders.panel.status': '状态',
  'folders.phase.checkingCache': '检查缓存',
  'folders.phase.discovering': '查找文件',
  'folders.phase.extractingCovers': '提取封面',
  'folders.phase.finished': '已完成',
  'folders.phase.groupingAlbums': '整理专辑',
  'folders.phase.readingMetadata': '读取标签',
  'folders.phase.writingDatabase': '写入数据库',
  'folders.prompt.choosePlaylist': '选择歌单编号：\n{names}',
  'folders.prompt.createPlaylist': '还没有歌单。输入名称来创建一个：',
  'folders.queueSource.recursive': '{name} 文件夹',
  'folders.scan.progress': '{processed}/{total} 个文件，{errors} 个错误',
  'folders.sidebar.kicker': '曲库',
  'folders.sidebar.title': '文件夹',
  'folders.sort.album': '专辑',
  'folders.sort.artist': '艺术家',
  'folders.sort.duration': '时长',
  'folders.sort.quality': '音质',
  'folders.sort.random': '随机',
  'folders.sort.recent': '最近更新',
  'folders.sort.title': '标题',
  'folders.status.cancelled': '已取消',
  'folders.status.completed': '完成',
  'folders.status.failed': '失败',
  'folders.status.queued': '排队中',
  'folders.status.running': '扫描中',
  'folders.statusLine.loadingTracks': '正在读取文件夹歌曲...',
  'folders.statusLine.preparingQueue': '正在准备文件夹队列...',
  'notice.browserFolderPicker': '浏览器预览已打开文件夹选择器。真实曲库导入需要使用 Electron 桌面应用。',
  'notice.browserFilePicker': '浏览器预览已选择 {name}。请在 ECHO Next 桌面端通过 Audio Core 播放。',
  'notice.windowControlsDesktop': '窗口控制只在 Electron 桌面窗口中可用。',
  'queue.action.clear': '清空队列',
  'queue.action.dragLabel': '拖拽 {title}',
  'queue.action.dragTitle': '拖拽排序',
  'queue.action.generateFromHistory': '按历史生成队列',
  'queue.action.generateRandom': '生成随机队列',
  'queue.action.generatingHistory': '生成中',
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
  'queue.error.noHistoryTracks': '还没有可用于生成队列的播放历史。',
  'queue.error.noRandomTracks': '曲库里还没有可加入随机队列的歌曲。',
  'queue.header.kicker': '播放队列',
  'queue.header.title': '队列',
  'queue.historySource': '历史常听',
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
  'route.connect.description': 'DLNA / AirPlay 无线播放。',
  'route.connect.label': 'Connect',
  'route.downloads.description': '下载任务占位。',
  'route.downloads.label': '下载',
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
  'route.lyrics.description': '歌词与沉浸播放。',
  'route.lyrics.label': '歌词',
  'route.lyricsSettings.description': '歌词偏好设置。',
  'route.lyricsSettings.label': '歌词设置',
  'route.mvSettings.description': 'MV 绑定与本地匹配设置。',
  'route.mvSettings.label': 'MV 设置',
  'mvSettings.action.chooseFile': '选择文件',
  'mvSettings.action.close': '关闭 MV 设置',
  'mvSettings.action.collapseNetwork': '折叠网络来源',
  'mvSettings.action.dragReorder': '拖拽调整优先级',
  'mvSettings.action.dragSource': '拖拽 {provider} 调整优先级',
  'mvSettings.action.expandNetwork': '展开网络来源',
  'mvSettings.action.findLocal': '查找本地',
  'mvSettings.action.openExternal': '在外部打开已选 MV',
  'mvSettings.action.refresh': '刷新',
  'mvSettings.action.removeSelected': '移除已选 MV',
  'mvSettings.action.searchNetwork': '搜索网络 MV',
  'mvSettings.aria.candidates': 'MV 候选列表',
  'mvSettings.aria.drawer': 'MV 设置',
  'mvSettings.aria.engineStatus': 'MV 引擎状态',
  'mvSettings.aria.maxQuality': '最高画质 {quality}',
  'mvSettings.aria.maxQualityOptions': '最高画质选项',
  'mvSettings.aria.networkSources': '网络来源优先级',
  'mvSettings.aria.selectedQuality': '已选 MV 画质 {quality}',
  'mvSettings.aria.selectedQualityOptions': '已选 MV 画质选项',
  'mvSettings.badge.credentialsMain': '凭据保留在主进程',
  'mvSettings.badge.proxyOnly': '仅代理访问',
  'mvSettings.binding.selectedMv': '已选 MV',
  'mvSettings.binding.title': 'MV来源',
  'mvSettings.candidate.external': '外部',
  'mvSettings.candidate.inApp': '应用内',
  'mvSettings.custom.apply': '应用自定义 MV',
  'mvSettings.custom.description': '粘贴 YouTube 或 Bilibili 视频链接作为当前 MV。',
  'mvSettings.custom.directDash': '直连流（DASH）',
  'mvSettings.custom.input': '自定义 MV 链接',
  'mvSettings.custom.placeholder': 'https://youtube.com/watch?v=... 或 BVxxxxxxxx',
  'mvSettings.custom.playing': '正在播放：{provider} - {sourceId}',
  'mvSettings.custom.title': '自定义 MV',
  'mvSettings.custom.videoTitle': '视频标题：{title}',
  'mvSettings.engine.mvTitle': 'MV标题',
  'mvSettings.engine.network': '网络',
  'mvSettings.engine.quality': '画质',
  'mvSettings.engine.selected': '已选',
  'mvSettings.engine.title': 'MV 引擎',
  'mvSettings.error.noActiveTrackBinding': '没有可用于 MV 绑定的当前曲库歌曲',
  'mvSettings.error.noActiveTrackMatching': '没有可用于 MV 匹配的当前曲库歌曲',
  'mvSettings.error.noActiveTrackNetworkSearch': '没有可用于网络 MV 搜索的当前曲库歌曲',
  'mvSettings.error.noLocalCandidates': '没有找到本地 MV 候选',
  'mvSettings.error.noNetworkCandidates': '没有找到网络 MV 候选',
  'mvSettings.general.enabled': '启用 MV',
  'mvSettings.immersive.blur': '毛玻璃模糊',
  'mvSettings.immersive.brightness': '背景亮度',
  'mvSettings.immersive.description': '开启后，歌词页使用当前 MV 作为背景。',
  'mvSettings.immersive.dragHint': '也可以在歌词页空白处拖动调整。',
  'mvSettings.immersive.lyricsReadability': '歌词可读性增强',
  'mvSettings.immersive.lyricsReadabilityDescription': '为沉浸式 MV 上的歌词增加描边和投影。',
  'mvSettings.immersive.overlay': '暗色遮罩',
  'mvSettings.immersive.overlayHint': '越低越接近原片，越高歌词越清晰。',
  'mvSettings.immersive.positionX': '横向位置',
  'mvSettings.immersive.positionY': '纵向位置',
  'mvSettings.immersive.reset': '重置沉浸式背景',
  'mvSettings.immersive.title': '沉浸式 MV 背景',
  'mvSettings.immersive.visualHint': '用于调节沉浸式背景观感。',
  'mvSettings.immersive.zoom': '背景缩放',
  'mvSettings.network.autoApply': '自动搜索网络MV',
  'mvSettings.network.autoApplyThreshold': '自动应用匹配度',
  'mvSettings.network.autoApplyThresholdDescription': '候选达到 {threshold} 以上才会自动应用。',
  'mvSettings.network.autoPreload': '是否预加载MV',
  'mvSettings.network.autoPreloadDescription': '开启后，只要播放歌曲就会尝试提前查找并准备当前歌曲的 MV。',
  'mvSettings.network.maxQuality': '最高画质',
  'mvSettings.network.replayAudioOnChange': '切换MV后自动重播音乐',
  'mvSettings.network.replayAudioOnChangeDescription': '开启后，手动选择或绑定新的 MV 会重新播放当前歌曲，让新 MV 立即生效。',
  'mvSettings.network.restartAudioOnLoad': 'MV 跟随音乐进度',
  'mvSettings.network.restartAudioOnLoadDescription': '开启后，只校准 MV 视频时间，不会 seek 或重启音频；歌词同步偏移不会影响 MV。',
  'mvSettings.network.title': '网络来源',
  'mvSettings.offset.aria': 'MV 同步延迟',
  'mvSettings.offset.description': '只保存到当前这首歌的 MV；换歌后不会影响其他歌曲。',
  'mvSettings.offset.earlier': 'MV 提前 {value}',
  'mvSettings.offset.later': 'MV 延后 {value}',
  'mvSettings.offset.reset': '重置 MV 延迟',
  'mvSettings.offset.title': '本歌曲 MV 延迟',
  'mvSettings.provider.local': '本地',
  'mvSettings.quality.max': '最高',
  'mvSettings.search.input': 'MV 搜索关键词',
  'mvSettings.search.placeholder': '输入 MV 搜索关键词',
  'mvSettings.search.useCurrentSong': '使用当前歌曲和歌手搜索',
  'mvSettings.status.auto': '自动',
  'mvSettings.status.noActiveTrack': '没有当前歌曲',
  'mvSettings.status.none': '无',
  'mvSettings.status.off': '关闭',
  'mvSettings.status.on': '开启',
  'mvSettings.title': 'MV 设置',
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
  'settings.appearance.artistAvatars.action.clear': '清除头像缓存',
  'settings.appearance.artistAvatars.action.queueing': '加入队列中...',
  'settings.appearance.artistAvatars.action.refreshMissing': '刷新缺失头像',
  'settings.appearance.artistAvatars.description': '在后台慢速获取真实歌手头像，并在艺术家墙复用本地缓存图片。',
  'settings.appearance.artistAvatars.fallback': '搜索不到时使用艺术家专辑封面',
  'settings.appearance.artistAvatars.message.cleared': '已清除 {removedRows} 条头像记录和 {deletedFiles} 个文件。',
  'settings.appearance.artistAvatars.message.desktopBridgeClear': '桌面桥不可用。请在 Electron 中打开 ECHO Next 以清除歌手头像。',
  'settings.appearance.artistAvatars.message.desktopBridgeRefresh': '桌面桥不可用。请在 Electron 中打开 ECHO Next 以刷新歌手头像。',
  'settings.appearance.artistAvatars.message.enableFirst': '请先开启自动获取歌手头像。',
  'settings.appearance.artistAvatars.message.queued': '已加入 {queued} 个歌手头像。跳过 {skipped} 个。',
  'settings.appearance.artistAvatars.title': '歌手头像',
  'settings.appearance.artistAvatars.toggle': '自动获取歌手头像',
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
  'settings.appearance.theme.description': '选择浅色、深色，或跟随系统外观。',
  'settings.appearance.theme.followSystem': '跟随系统',
  'settings.appearance.theme.light': '浅色',
  'settings.appearance.theme.title': '主题',
  'settings.appearance.themePreset.title': '主题预设',
  'settings.appearance.themePreset.description': '选择一套全局渐变色板；当前明暗模式仍会保留。',
  'settings.appearance.themePreset.classic': '经典 ECHO Next',
  'settings.appearance.themePreset.classic.description': '保持当前清爽蓝灰质感。',
  'settings.appearance.themePreset.echoTwilight': '暮光桃雾',
  'settings.appearance.themePreset.echoTwilight.description': '老版 ECHO 的暖粉渐变感。',
  'settings.appearance.themePreset.sakuraMilk': '樱粉奶霜',
  'settings.appearance.themePreset.sakuraMilk.description': '奶白粉底配樱桃红强调。',
  'settings.appearance.themePreset.peachSoda': '蜜桃苏打',
  'settings.appearance.themePreset.peachSoda.description': '蜜桃橙和苏打青的轻快组合。',
  'settings.appearance.themePreset.mintCandy': '薄荷软糖',
  'settings.appearance.themePreset.mintCandy.description': '薄荷绿、奶油白和一点桃粉。',
  'settings.appearance.themePreset.berryDream': '蓝莓星糖',
  'settings.appearance.themePreset.berryDream.description': '莓紫云白，带一点梦幻粉光。',
  'settings.appearance.themePreset.matchaCream': '抹茶奶油',
  'settings.appearance.themePreset.matchaCream.description': '抹茶绿和奶油黄，更安静耐看。',
  'settings.appearance.themePreset.lemonMochi': '柠檬麻薯',
  'settings.appearance.themePreset.lemonMochi.description': '奶黄和天蓝，像软糯柠檬点心。',
  'settings.appearance.themePreset.cottonCloud': '棉花云朵',
  'settings.appearance.themePreset.cottonCloud.description': '云白蓝配柔粉，高亮但不刺眼。',
  'settings.appearance.themePreset.melonCream': '哈密瓜奶霜',
  'settings.appearance.themePreset.melonCream.description': '蜜瓜绿与奶油底，清甜可读。',
  'settings.appearance.themePreset.seaSaltJelly': '海盐果冻',
  'settings.appearance.themePreset.seaSaltJelly.description': '海盐青配蜜桃光，清透但压得住文字。',
  'settings.appearance.themePreset.caramelPudding': '焦糖布丁',
  'settings.appearance.themePreset.caramelPudding.description': '奶油焦糖配草莓光，甜但不发腻。',
  'settings.appearance.themePreset.neonCandy': '霓虹糖果',
  'settings.appearance.themePreset.neonCandy.description': '紫色霓虹、粉色高光和薄荷泡泡。',
  'settings.appearance.themePreset.nyanCat': 'Nyan Cat',
  'settings.appearance.themePreset.nyanCat.description': '慢速流动的可爱彩虹渐变，进度条会带着彩虹猫一起跑。',
  'settings.appearance.themePreset.wisteriaBubble': '紫藤泡泡',
  'settings.appearance.themePreset.wisteriaBubble.description': '紫藤花雾配薄荷泡泡，梦幻但清爽。',
  'settings.appearance.themePreset.strawberryCookie': '草莓饼干',
  'settings.appearance.themePreset.strawberryCookie.description': '奶油饼干底配草莓红和烘焙金。',
  'settings.appearance.themePreset.graphiteAurora': '石墨极光',
  'settings.appearance.themePreset.graphiteAurora.description': '石墨灰里带一点青绿极光，冷静但有层次。',
  'settings.appearance.themePreset.amberNoir': '琥珀夜色',
  'settings.appearance.themePreset.amberNoir.description': '黑金唱片厅感，适合暗色长听。',
  'settings.appearance.themePreset.oceanStudio': '海岸录音室',
  'settings.appearance.themePreset.oceanStudio.description': '冷蓝灰和海雾蓝，干净专业。',
  'settings.appearance.themePreset.rosewoodVinyl': '玫瑰木黑胶',
  'settings.appearance.themePreset.rosewoodVinyl.description': '木质暖红与黑胶暗调，更沉稳复古。',
  'settings.appearance.themePreset.darkSideMoon': 'The Dark Side of the Moon',
  'settings.appearance.themePreset.darkSideMoon.description': '致敬 Pink Floyd：黑月、白色棱镜与彩虹光谱。',
  'settings.appearance.themePreset.shibuyaNight': '涩谷夜色',
  'settings.appearance.themePreset.shibuyaNight.description': '东京霓虹、夜紫街口和青色招牌光。',
  'settings.appearance.themePreset.kyotoKurenai': '京都朱印',
  'settings.appearance.themePreset.kyotoKurenai.description': '鸟居朱红、和纸暖底和御守金色。',
  'settings.appearance.themePreset.ukiyoIndigo': '浮世靛蓝',
  'settings.appearance.themePreset.ukiyoIndigo.description': '浮世绘海浪的靛蓝、纸色和古金。',
  'settings.appearance.themePreset.fujiSnow': '富士初雪',
  'settings.appearance.themePreset.fujiSnow.description': '雪白、富士蓝与淡樱高光，清澈冷甜。',
  'settings.appearance.themePreset.matsuriLantern': '祭灯金鱼',
  'settings.appearance.themePreset.matsuriLantern.description': '夏祭灯笼红、夜市金光和温暖纸色。',
  'settings.appearance.themePreset.ginzaNoir': '银座黑曜',
  'settings.appearance.themePreset.ginzaNoir.description': '黑曜石、香槟金和橱窗蓝，成熟一点。',
  'settings.appearance.themePreset.frostJazz': '霜林爵士',
  'settings.appearance.themePreset.frostJazz.description': '冷蓝爵士底色，带一抹梅紫舞台光。',
  'settings.appearance.themeCustom.title': '自定义当前主题',
  'settings.appearance.themeCustom.description': '先选一个主题，再微调颜色；每个主题都会记住自己的自定义。',
  'settings.appearance.themeCustom.action.autoFix': '自动修正文字',
  'settings.appearance.themeCustom.action.export': '导出参数',
  'settings.appearance.themeCustom.action.import': '导入参数',
  'settings.appearance.themeCustom.action.reset': '重置当前自定义',
  'settings.appearance.themeCustom.action.save': '保存自定义',
  'settings.appearance.themeCustom.advanced.show': '展开高级颜色',
  'settings.appearance.themeCustom.advanced.hide': '收起高级颜色',
  'settings.appearance.themeCustom.field.appBg': '底色',
  'settings.appearance.themeCustom.field.appBg2': '渐变中段',
  'settings.appearance.themeCustom.field.appBg3': '渐变尾色',
  'settings.appearance.themeCustom.field.panel': '玻璃色调',
  'settings.appearance.themeCustom.field.panelSoft': '柔面板',
  'settings.appearance.themeCustom.field.accent': '主强调色',
  'settings.appearance.themeCustom.field.accentStrong': '次强调色',
  'settings.appearance.themeCustom.field.secondary': '第三强调色',
  'settings.appearance.themeCustom.field.heading': '主文字',
  'settings.appearance.themeCustom.field.text': '正文文字',
  'settings.appearance.themeCustom.field.muted': '次要文字',
  'settings.appearance.themeCustom.field.border': '边界色',
  'settings.appearance.themeCustom.field.onAccent': '强调按钮文字',
  'settings.appearance.themeCustom.field.buttonText': '普通按钮文字',
  'settings.appearance.themeCustom.field.panelOpacity': '面板透明度',
  'settings.appearance.themeCustom.field.glass': '玻璃感',
  'settings.appearance.themeCustom.field.shadow': '阴影强度',
  'settings.appearance.themeCustom.field.appBg.description': '主窗口底色',
  'settings.appearance.themeCustom.field.appBg2.description': '背景渐变的柔光中段',
  'settings.appearance.themeCustom.field.appBg3.description': '背景渐变的末端停靠色',
  'settings.appearance.themeCustom.field.panel.description': '面板磨砂着色',
  'settings.appearance.themeCustom.field.panelSoft.description': '侧栏和弱层级面板',
  'settings.appearance.themeCustom.field.accent.description': '主要交互',
  'settings.appearance.themeCustom.field.accentStrong.description': '渐变与层次',
  'settings.appearance.themeCustom.field.secondary.description': '高光点缀',
  'settings.appearance.themeCustom.field.heading.description': '标题与主文案',
  'settings.appearance.themeCustom.field.text.description': '正文、歌手和设置文案',
  'settings.appearance.themeCustom.field.muted.description': '辅助说明',
  'settings.appearance.themeCustom.field.border.description': '卡片边框和分割线',
  'settings.appearance.themeCustom.field.onAccent.description': '强调按钮上的文字',
  'settings.appearance.themeCustom.field.buttonText.description': '普通按钮和芯片文字',
  'settings.appearance.themeCustom.field.panelOpacity.description': '面板露出背景的程度',
  'settings.appearance.themeCustom.field.glass.description': '背景模糊和玻璃层次',
  'settings.appearance.themeCustom.field.shadow.description': '卡片、弹窗和播放器投影',
  'settings.appearance.themeCustom.preview.title': '正在编辑',
  'settings.appearance.themeCustom.preview.description': '改动会先实时预览，保存后才写入设置。',
  'settings.appearance.themeCustom.group.core': '常用颜色',
  'settings.appearance.themeCustom.group.core.description': '老 ECHO 式主色板，改这里最直观。',
  'settings.appearance.themeCustom.group.gradient': '背景渐变',
  'settings.appearance.themeCustom.group.gradient.description': '控制老 ECHO 那种窗口底色渐变氛围。',
  'settings.appearance.themeCustom.group.advanced': '高级细节',
  'settings.appearance.themeCustom.group.advanced.description': '更细的文字、边界和按钮文字颜色。',
  'settings.appearance.themeCustom.message.exported': '已导出当前主题参数。',
  'settings.appearance.themeCustom.message.imported': '已导入主题参数并应用。',
  'settings.appearance.themeCustom.message.importFailed': '导入失败，请选择 ECHO 主题参数 JSON。',
  'settings.appearance.themeCustom.message.fixed': '已自动调整文字与按钮颜色。',
  'settings.appearance.themeCustom.message.invalidColor': '请输入 #RRGGBB 格式的安全颜色。',
  'settings.appearance.themeCustom.message.lowContrast': '当前文字对比度不足，先自动修正或调深文字后再保存。',
  'settings.appearance.themeCustom.message.reset': '已重置当前主题的自定义。',
  'settings.appearance.themeCustom.message.saved': '已保存当前主题自定义。',
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
  'settings.integrations.discord.action.refresh': '刷新状态',
  'settings.integrations.discord.description': '将当前播放状态同步到 Discord Rich Presence，可显示歌曲、艺术家、进度和播放状态。',
  'settings.integrations.discord.title': 'Discord 状态',
  'settings.integrations.smtc.description': '把当前播放信息、封面、进度和媒体键动作发布到 Windows 音量浮层与锁屏媒体控件。',
  'settings.integrations.smtc.title': 'Windows 媒体控件',
  'settings.integrations.lastfm.action.completeAuth': '完成授权',
  'settings.integrations.lastfm.action.connect': '连接 Last.fm',
  'settings.integrations.lastfm.action.disconnect': '断开连接',
  'settings.integrations.lastfm.action.refresh': '刷新状态',
  'settings.integrations.lastfm.activeProgress': '{artist} - {title} · {played}/{threshold} 秒',
  'settings.integrations.lastfm.activeTrack': '当前曲目',
  'settings.integrations.lastfm.connection.description': '推荐使用浏览器授权。在 Last.fm 点 Allow 后，回到 ECHO Next 完成授权。',
  'settings.integrations.lastfm.connection.title': 'Last.fm 连接',
  'settings.integrations.lastfm.description': '在主进程记录本地播放，不发送文件路径、歌词或封面。',
  'settings.integrations.lastfm.lastNowPlaying': '上次 Now Playing',
  'settings.integrations.lastfm.lastScrobble': '上次 Scrobble',
  'settings.integrations.lastfm.never': '尚未发送',
  'settings.integrations.lastfm.noActiveTrack': '无活跃曲目',
  'settings.integrations.lastfm.nowPlaying.description': '开始播放时发送一次当前曲目信息。',
  'settings.integrations.lastfm.nowPlaying.title': 'Last.fm Now Playing',
  'settings.integrations.lastfm.scrobbling.description': '曲目达到 Last.fm 记录阈值后提交播放记录。',
  'settings.integrations.lastfm.scrobbling.title': 'Last.fm Scrobbling',
  'settings.integrations.lastfm.status.connected': '已连接 {username}',
  'settings.integrations.lastfm.status.error': '错误：{error}',
  'settings.integrations.lastfm.status.notConnected': '未连接',
  'settings.integrations.lastfm.status.pending': '等待完成授权',
  'settings.integrations.lastfm.statusLabel': '状态',
  'settings.integrations.lastfm.title': 'Last.fm',
  'settings.integrations.mobile.description': '未来外部设备能力会走受控 IPC，不让 Renderer 直连系统资源。',
  'settings.integrations.mobile.title': '手机遥控',
  'settings.library.network.description': '手动弱补全；本地内嵌元数据始终优先。',
  'settings.library.network.title': '网络元数据补全',
  'settings.library.networkSources.description': '选择手动修复和缺失扫描使用的补全源。',
  'settings.library.networkSources.title': '网络补全来源',
  'settings.library.networkPanel.applyMissingOnly': '仅补缺失项',
  'settings.library.networkPanel.applySelected': '应用所选候选',
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
  'settings.library.networkPanel.repairMissing': '补全当前歌曲',
  'settings.library.networkPanel.repairThisTrack': '补全此曲',
  'settings.library.networkPanel.scanComplete': '扫描完成',
  'settings.library.networkPanel.scanMissing': '扫描缺失信息',
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
  'settings.eq.action.autoPreamp': '自动 {value}',
  'settings.eq.action.bypass': '旁路',
  'settings.eq.action.delete': '删除',
  'settings.eq.action.duplicatePreset': '复制当前',
  'settings.eq.action.freqDown': '频率 -',
  'settings.eq.action.freqFineDown': '细 -',
  'settings.eq.action.freqFineUp': '细 +',
  'settings.eq.action.freqUp': '频率 +',
  'settings.eq.action.holdBypass': '按住旁路 EQ',
  'settings.eq.action.hideAdvanced': '隐藏高级',
  'settings.eq.action.applyA': '应用 A',
  'settings.eq.action.applyB': '应用 B',
  'settings.eq.action.applySafePreamp': '应用安全前级',
  'settings.eq.action.overwrite': '覆盖当前',
  'settings.eq.action.redo': '重做',
  'settings.eq.action.resetBand': '重置 {frequency}',
  'settings.eq.action.resetAllGains': '重置全部增益',
  'settings.eq.action.resetChannelBalance': '重置声道平衡',
  'settings.eq.action.resetEq': '重置 EQ',
  'settings.eq.action.resetFrequencies': '恢复标准频点',
  'settings.eq.action.resetMonitorTools': '重置监听工具',
  'settings.eq.action.resetSelected': '重置选中',
  'settings.eq.action.resetTrimsOnly': '只重置校正',
  'settings.eq.action.revertUserPreset': '还原用户预设',
  'settings.eq.action.save': '保存',
  'settings.eq.action.saveAs': '另存为',
  'settings.eq.action.showAdvanced': '高级',
  'settings.eq.action.storeA': '存入 A',
  'settings.eq.action.storeB': '存入 B',
  'settings.eq.action.toggleBypassOff': '关闭旁路',
  'settings.eq.action.toggleBypassOn': '切换旁路',
  'settings.eq.action.undo': '撤销',
  'settings.eq.action.unlockFrequency': '解锁频率',
  'settings.eq.ab.emptySlot': '空槽',
  'settings.eq.ab.loudnessMatched': '响度匹配',
  'settings.eq.ab.summary': '{preset} / peak {peak} / out {output} / preamp {preamp}',
  'settings.eq.ab.title': 'A/B 对比',
  'settings.eq.band.fallback': '频段',
  'settings.eq.band.frequency': '频率',
  'settings.eq.band.frequencyStepper': '频率步进',
  'settings.eq.band.frequencySnapped': '吸附到标准频点',
  'settings.eq.band.frequencyUnlocked': '自由频率',
  'settings.eq.band.gain': '增益',
  'settings.eq.band.gainStepper': '增益步进',
  'settings.eq.band.inspector': '选中频段',
  'settings.eq.band.readoutsAria': '10 段 EQ 可拖动频段读数',
  'settings.eq.bitPerfect.channelDisabled': 'DSP 已启用：bit-perfect 已关闭。',
  'settings.eq.bitPerfect.disabled': 'DSP 已启用：bit-perfect 已关闭{reason}。',
  'settings.eq.bitPerfect.readyPath': '可保留 bit-perfect 路径。',
  'settings.eq.bitPerfect.sourceBoth': 'EQ + 声道平衡',
  'settings.eq.bitPerfect.sourceChannel': '声道平衡',
  'settings.eq.bitPerfect.sourceEq': 'EQ',
  'settings.eq.channel.active': '启用',
  'settings.eq.channel.balance': '平衡',
  'settings.eq.channel.bypassed': '旁路',
  'settings.eq.channel.calibrationMode': '校准模式',
  'settings.eq.channel.center': '居中',
  'settings.eq.channel.constantPower': '恒定功率',
  'settings.eq.channel.description': 'Balance 用于左右偏移；L/R Gain 用于精细校正；Mono Sum 用于单声道检查；Invert 用于相位检查。',
  'settings.eq.channel.dsp': 'DSP',
  'settings.eq.channel.effectiveLeft': '左有效增益',
  'settings.eq.channel.effectiveRight': '右有效增益',
  'settings.eq.channel.group.balance': 'Balance',
  'settings.eq.channel.group.gainTrim': 'Gain Trim',
  'settings.eq.channel.group.monitorTools': '监听工具',
  'settings.eq.channel.group.phaseTools': '相位工具',
  'settings.eq.channel.invertLeft': '左声道反相',
  'settings.eq.channel.invertRight': '右声道反相',
  'settings.eq.channel.leftGain': '左增益',
  'settings.eq.channel.leftTotal': '左总增益',
  'settings.eq.channel.mono.left': '左',
  'settings.eq.channel.mono.off': '关闭',
  'settings.eq.channel.mono.right': '右',
  'settings.eq.channel.mono.sum': '合并',
  'settings.eq.channel.monoMode': '单声道模式',
  'settings.eq.channel.quick.leftSolo': '左声道 Solo',
  'settings.eq.channel.quick.monoCheck': '单声道检查',
  'settings.eq.channel.quick.phaseCheck': '相位检查',
  'settings.eq.channel.quick.rightSolo': '右声道 Solo',
  'settings.eq.channel.quick.swapCheck': '交换检查',
  'settings.eq.channel.quickTools': '快速监听工具',
  'settings.eq.channel.rightGain': '右增益',
  'settings.eq.channel.rightTotal': '右总增益',
  'settings.eq.channel.swap': '交换 L/R',
  'settings.eq.channel.title': '声道平衡',
  'settings.eq.curve.aria': '可拖动 10 段 EQ 频响曲线',
  'settings.eq.curve.dragBand': '拖动 {frequency} EQ 频段',
  'settings.eq.curve.fineEdit': 'Shift 细调',
  'settings.eq.curve.freeFrequency': '自由频率',
  'settings.eq.curve.snapped': '标准吸附',
  'settings.eq.error.bridgeChannelBalance': '桌面桥接不可用。请在 ECHO Next 桌面端控制声道平衡。',
  'settings.eq.error.bridgeControlEq': '桌面桥接不可用。请在 ECHO Next 桌面端控制 EQ。',
  'settings.eq.error.bridgeDeletePreset': '桌面桥接不可用。请在 ECHO Next 桌面端删除 EQ 预设。',
  'settings.eq.error.bridgeSavePreset': '桌面桥接不可用。请在 ECHO Next 桌面端保存 EQ 预设。',
  'settings.eq.error.presetName': '请输入预设名称。',
  'settings.eq.level.clips': '削波 {count}',
  'settings.eq.level.estimatedOutputPeak': '估算输出峰值',
  'settings.eq.level.headroom': '余量',
  'settings.eq.level.inputPeak': '输入峰值',
  'settings.eq.level.inputRms': '输入 RMS',
  'settings.eq.level.sourceEstimate': 'pre-native + DSP 估算',
  'settings.eq.preamp.aria': 'EQ 前级增益',
  'settings.eq.preamp.inputSafety': '输入安全估算',
  'settings.eq.preamp.maxBoost': '最大提升',
  'settings.eq.preamp.metricsAria': '安全余量指标',
  'settings.eq.preamp.recommended': '建议',
  'settings.eq.preamp.safeHeadroom': '安全余量',
  'settings.eq.preset.approximation': '10 段近似',
  'settings.eq.preset.builtIn': '内置预设',
  'settings.eq.preset.copyName': '{name} 副本',
  'settings.eq.preset.filter.all': '全部',
  'settings.eq.preset.filter.builtIn': '内置',
  'settings.eq.preset.filter.genre': '风格',
  'settings.eq.preset.filter.target': '目标曲线',
  'settings.eq.preset.filter.user': '用户',
  'settings.eq.preset.filter.utility': '工具',
  'settings.eq.preset.filterAria': '预设筛选',
  'settings.eq.preset.meta.approximationCaution': '这是 10 段图示 EQ 近似，不是精确耳机校准。',
  'settings.eq.preset.meta.genrePurpose': '用于快速塑造音乐风格取向。',
  'settings.eq.preset.meta.genreScenario': '适合按曲风试听，再按设备微调。',
  'settings.eq.preset.meta.targetPurpose': '用于接近常见听感目标曲线。',
  'settings.eq.preset.meta.targetScenario': '适合耳机或近场系统的目标曲线对比。',
  'settings.eq.preset.meta.tasteCaution': '这是听感取向，不是校准结果。',
  'settings.eq.preset.meta.type.animeJpop': 'Anime / J-Pop',
  'settings.eq.preset.meta.type.bassBoost': '低频增强',
  'settings.eq.preset.meta.type.bkRoomCurve': 'B&K 房间曲线',
  'settings.eq.preset.meta.type.broadcastVoice': '广播人声',
  'settings.eq.preset.meta.type.classicSmiley': '经典微笑曲线',
  'settings.eq.preset.meta.type.classical': '古典',
  'settings.eq.preset.meta.type.diffuseField': 'Diffuse Field',
  'settings.eq.preset.meta.type.flat': '平直',
  'settings.eq.preset.meta.type.harmanInEar': 'Harman 入耳目标',
  'settings.eq.preset.meta.type.harmanTarget': 'Harman 目标',
  'settings.eq.preset.meta.type.headphoneWarm': '耳机暖声',
  'settings.eq.preset.meta.type.loudness': '响度补偿',
  'settings.eq.preset.meta.type.night': '夜间',
  'settings.eq.preset.meta.type.rock': '摇滚',
  'settings.eq.preset.meta.type.studioNeutral': '录音室中性',
  'settings.eq.preset.meta.type.trebleSparkle': '高频空气感',
  'settings.eq.preset.meta.type.vinylWarmth': '黑胶暖声',
  'settings.eq.preset.meta.type.vocalClear': '人声清晰',
  'settings.eq.preset.meta.utilityCaution': '工具型预设会改变监听判断，请确认后再保存。',
  'settings.eq.preset.meta.utilityPurpose': '用于检查、补偿或更安全的监听。',
  'settings.eq.preset.meta.utilityScenario': '适合定位问题、降低疲劳或做快速对比。',
  'settings.eq.preset.modified': '已修改',
  'settings.eq.preset.nameAria': '预设名称',
  'settings.eq.preset.readonly': '内置预设为只读。',
  'settings.eq.preset.savePlaceholder': '保存为用户预设',
  'settings.eq.preset.searchAria': '搜索预设',
  'settings.eq.preset.searchPlaceholder': '搜索预设',
  'settings.eq.preset.selectorAria': 'EQ 预设',
  'settings.eq.preset.user': '用户预设',
  'settings.eq.state.eqDisabled': 'EQ 已关闭',
  'settings.eq.state.eqEnabled': 'EQ 已启用',
  'settings.eq.status.bitPerfect': 'Bit-perfect',
  'settings.eq.status.clippingRisk': '削波风险',
  'settings.eq.status.eq': 'EQ',
  'settings.eq.status.estimatedPeak': '估算峰值',
  'settings.eq.status.headroom': '余量',
  'settings.eq.status.preamp': '前级',
  'settings.eq.status.preset': '预设',
  'settings.eq.status.safe': '安全',
  'settings.eq.status.safeHeadroomShort': '安全余量',
  'settings.eq.status.warning': '警告',
  'settings.eq.subtitle': 'HiFi DSP 面板',
  'settings.eq.title': '10 段图示 EQ',
  'settings.eq.warning.channelClipping': '存在削波风险：降低增益或前级可获得更安全的余量。',
  'settings.eq.warning.lowerPreamp': '降低前级可避免削波。',
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
  'settings.nav.shortcuts.description': '全局按键、播放暂停、上一首、下一首',
  'settings.nav.shortcuts.label': '快捷键',
  'settings.playback.audioStatus.description': '采样率字段必须分开显示，避免旧 ECHO 独占模式 48k 锁死回归。',
  'settings.playback.audioStatus.title': '音频状态',
  'settings.playback.automix.description': '默认关闭。开启后，连续队列会提前准备下一首，并用原生双 Deck 引擎避开尾部空白、智能衔接切歌。',
  'settings.playback.automix.title': 'Automix 智能过渡',
  'settings.playback.followCurrent.description': '开启后，切歌时会自动把左侧当前列表滚动到正在播放的歌曲位置。',
  'settings.playback.followCurrent.title': '定位当前播放歌曲',
  'settings.playback.outputDevice.description': '来自 echo-audio-host 的设备列表；没有设备时保持默认输出。',
  'settings.playback.outputDevice.empty': '无可用设备',
  'settings.playback.outputDevice.title': '输出设备',
  'settings.playback.outputMode.description': 'Shared 适合日常使用，Exclusive / ASIO 用于采样率验收和后续 bit-perfect 路径。',
  'settings.playback.outputMode.title': '输出模式',
  'settings.playback.sharedBackend.description': 'DirectSound 只作为手动兼容模式，延迟较大；日常播放保持 WASAPI Shared。',
  'settings.playback.sharedBackend.directSound': 'DirectSound 兼容',
  'settings.playback.sharedBackend.title': '共享后端',
  'settings.playback.sharedBackend.wasapi': 'WASAPI Shared',
  'settings.playback.resetEngine.action': '重启音频引擎',
  'settings.playback.resetEngine.busy': '正在重启',
  'settings.playback.resetEngine.description': '停止当前播放并释放 native 音频主机；设备/驱动卡住时可先试这个，不必重开软件。',
  'settings.playback.resetEngine.done': '音频引擎已重启，你可以重新开始播放',
  'settings.playback.resetEngine.title': '重启音频引擎',
  'settings.playback.troubleshooting.description': '如果声音卡住或设备列表不正常，点这里。软重启不会影响其他应用。',
  'settings.playback.troubleshooting.hardAction': '重启 Windows 音频服务',
  'settings.playback.troubleshooting.hardBusy': '正在重启 Windows 音频服务',
  'settings.playback.troubleshooting.hardConfirm': '这会中断所有应用的声音（Chrome、游戏、通话），并需要管理员权限。是否继续？',
  'settings.playback.troubleshooting.hardDone': 'Windows 音频服务已恢复，你可以重新开始播放',
  'settings.playback.troubleshooting.softAction': '重启音频引擎',
  'settings.playback.troubleshooting.softBusy': '正在重启音频引擎',
  'settings.playback.troubleshooting.softDone': '音频引擎已重启，你可以重新开始播放',
  'settings.playback.troubleshooting.title': '音频故障排除',
  'settings.playback.speedMode.description': '选择播放器底部速度滑条使用的变速方式。',
  'settings.playback.speedMode.title': '变速模式',
  'settings.playback.stability.action.copied': '已复制',
  'settings.playback.stability.action.copy': '复制诊断信息',
  'settings.playback.stability.action.refresh': '刷新播放稳定性诊断',
  'settings.playback.stability.error.desktopBridgeUnavailable': '桌面桥接不可用。',
  'settings.playback.stability.field.lastSharedStabilityRecoveryAt': '上次 Shared 稳定恢复时间',
  'settings.playback.stability.field.lastWatchdogRecoveryTime': '上次 watchdog 恢复时间',
  'settings.playback.stability.field.nativeBufferedFrames': 'Native 缓冲帧',
  'settings.playback.stability.field.nativeBufferedMs': 'Native 缓冲毫秒',
  'settings.playback.stability.field.nativeDeviceBufferFrames': '设备缓冲帧',
  'settings.playback.stability.field.nativeFifoCapacityFrames': 'Native FIFO 容量帧',
  'settings.playback.stability.field.nativeStartupPrebufferFrames': '启动预缓冲帧',
  'settings.playback.stability.field.nativeUnderrunCallbacks': 'Native underrun 回调',
  'settings.playback.stability.field.nativeUnderrunFrames': 'Native underrun 帧',
  'settings.playback.stability.field.recentWatchdogRecoveryCount': '近期 watchdog 恢复次数',
  'settings.playback.stability.field.sharedStabilityTier': 'Shared 稳定档',
  'settings.playback.stability.field.watchdogStatus': 'watchdog 状态',
  'settings.playback.stability.title': '播放稳定性诊断',
  'settings.playback.stability.value.unknown': '未知',
  'settings.playback.wireless.description': '后续 HiFi 引擎阶段再接入；当前阶段不迁移 gapless / automix / 流媒体。',
  'settings.playback.wireless.title': '无线播放',
  'settings.shortcuts.action.clear': '清除',
  'settings.shortcuts.action.bossKey.description': '立即隐藏窗口，并把 ECHO 音量降到 0。',
  'settings.shortcuts.action.bossKey.title': '老板键',
  'settings.shortcuts.action.nextTrack.description': '切到当前播放队列里的下一首。',
  'settings.shortcuts.action.nextTrack.title': '下一首',
  'settings.shortcuts.action.openAudioSettings.description': '打开底部播放器的音频设置抽屉。',
  'settings.shortcuts.action.openAudioSettings.title': '打开音频设置',
  'settings.shortcuts.action.openLyricsSettings.description': '打开歌词设置抽屉。',
  'settings.shortcuts.action.openLyricsSettings.title': '打开歌词设置',
  'settings.shortcuts.action.openMvSettings.description': '打开 MV 设置抽屉。',
  'settings.shortcuts.action.openMvSettings.title': '打开 MV 设置',
  'settings.shortcuts.action.playPause.description': '在全局范围切换播放和暂停。',
  'settings.shortcuts.action.playPause.title': '播放 / 暂停',
  'settings.shortcuts.action.previousTrack.description': '切到当前播放队列里的上一首。',
  'settings.shortcuts.action.previousTrack.title': '上一首',
  'settings.shortcuts.action.record': '录制',
  'settings.shortcuts.action.restoreRecommended': '恢复推荐',
  'settings.shortcuts.action.seekBackward.description': '当前歌曲向后退 10 秒。',
  'settings.shortcuts.action.seekBackward.title': '快退 10 秒',
  'settings.shortcuts.action.seekForward.description': '当前歌曲向前进 10 秒。',
  'settings.shortcuts.action.seekForward.title': '快进 10 秒',
  'settings.shortcuts.action.showMainWindow.description': '把 ECHO 主窗口带回前台。',
  'settings.shortcuts.action.showMainWindow.title': '显示主窗口',
  'settings.shortcuts.action.speedDown.description': '每次把播放速度降低 0.1x。',
  'settings.shortcuts.action.speedDown.title': '播放减速',
  'settings.shortcuts.action.speedUp.description': '每次把播放速度提高 0.1x。',
  'settings.shortcuts.action.speedUp.title': '播放加速',
  'settings.shortcuts.action.stop.description': '停止当前播放并释放播放状态。',
  'settings.shortcuts.action.stop.title': '停止播放',
  'settings.shortcuts.action.volumeDown.description': '把 ECHO 音量降低 5%。',
  'settings.shortcuts.action.volumeDown.title': '音量降低',
  'settings.shortcuts.action.volumeUp.description': '把 ECHO 音量提高 5%。',
  'settings.shortcuts.action.volumeUp.title': '音量提高',
  'settings.shortcuts.description': '快捷键默认全部关闭；可录制单键、组合键、媒体键或小键盘宏键，再打开右侧开关即可立即生效。',
  'settings.shortcuts.empty': '未绑定',
  'settings.shortcuts.message.duplicate': '这个快捷键已经绑定到其他动作。',
  'settings.shortcuts.message.empty': '请先录制一个快捷键。',
  'settings.shortcuts.message.invalid': '这个按键目前不能作为全局快捷键。',
  'settings.shortcuts.message.safe': '这个快捷键可以使用。',
  'settings.shortcuts.message.unavailable': '这个快捷键已被系统或其他应用占用，已保持关闭。',
  'settings.shortcuts.message.unsafe': '这个按键目前不能作为全局快捷键；可以让小键盘输出标准键盘键或媒体键。',
  'settings.shortcuts.note': '支持单键、组合键、媒体键、宏键盘键和鼠标侧键；鼠标侧键在 Windows 会走独立全局监听。',
  'settings.shortcuts.recording': '按下新的快捷键...',
  'settings.shortcuts.title': '全局快捷键',
  'settings.remote.library.description': '本阶段禁止网盘 / 远程 / 流媒体，只保留设置分组占位。',
  'settings.remote.library.title': '远程音乐库',
};

const zhTW: TranslationMap = {
  ...zhCN,
  'library.action.refresh': '重新整理',
  'library.albums.card.tracks': '{count} 首歌',
  'library.albums.error.desktopBridge': '桌面橋接不可用。請在 ECHO Next 桌面版中讀取專輯。',
  'library.albums.listAria': '專輯列表',
  'library.albums.loading': '正在載入專輯...',
  'library.albums.searchPlaceholder': '搜尋專輯 / 藝術家',
  'library.albums.sort.aria': '專輯排序',
  'library.albums.sort.artist': '藝術家',
  'library.albums.sort.titleAsc': '標題 A-Z',
  'library.albums.sort.titleDesc': '標題 Z-A',
  'library.albums.title': '專輯',
  'library.artists.error.desktopBridge': '桌面橋接不可用。請在 ECHO Next 桌面版中讀取藝術家。',
  'library.artists.avatarPriority': '頭像優先',
  'library.artists.listAria': '藝術家列表',
  'library.artists.loading': '正在載入藝術家...',
  'library.artists.meta.albums': '{count} 張專輯',
  'library.artists.meta.noTracks': '暫無歌曲',
  'library.artists.meta.tracks': '{count} 首歌',
  'library.artists.searchPlaceholder': '搜尋藝術家',
  'library.artists.sort.aria': '藝術家排序',
  'library.artists.sort.frequent': '歌曲最多',
  'library.artists.sort.nameAsc': '名稱 A-Z',
  'library.artists.sort.nameDesc': '名稱 Z-A',
  'library.artists.title': '藝術家',
  'library.count.total': '共 {count} 個',
  'library.sort.createdAsc': '建立最早',
  'library.sort.createdDesc': '建立最新',
  'library.sort.default': '預設',
  'library.sort.durationAsc': '時長最短',
  'library.sort.durationDesc': '時長最長',
  'library.sort.fileModifiedAsc': '檔案修改最早',
  'library.sort.fileModifiedDesc': '檔案修改最新',
  'library.sort.random': '隨機',
  'library.sort.recent': '最近',
  'library.source.aria': '媒體庫來源',
  'library.source.local': '本機',
  'library.source.remote': '網路硬碟',
  'audioDrawer.action.close': '關閉音訊設定',
  'audioDrawer.action.copiedDiagnostics': '已複製播放診斷資訊',
  'audioDrawer.action.copyDiagnostics': '複製播放診斷資訊',
  'audioDrawer.action.hideDevice': '隱藏裝置',
  'audioDrawer.action.openAsioPanel': '開啟 ASIO 面板',
  'audioDrawer.action.resetEngine': '重置音訊引擎',
  'audioDrawer.action.resetEngineBusy': '正在重置音訊引擎',
  'audioDrawer.action.resetEngineDone': '音訊引擎已重置',
  'audioDrawer.action.restore': '復原',
  'audioDrawer.asioLatency.description': '根據目前開啟的緩衝估算輸出端會多等多久才播放。數值越低越即時，數值越高越穩、越不容易爆音。',
  'audioDrawer.asioLatency.recommended': '建議延遲',
  'audioDrawer.asioLatency.status': '要求 {requested} frames / 已開啟 {opened} frames',
  'audioDrawer.asioLatency.value': '{value} ms',
  'audioDrawer.asioRoutes.title': 'ASIO 輸出通道',
  'audioDrawer.badge.bitPerfectReady': 'Bit-perfect 就緒',
  'audioDrawer.badge.dspActive': 'DSP 啟用',
  'audioDrawer.badge.juceFallback': 'JUCE 已降級',
  'audioDrawer.badge.juceOutput': 'JUCE 輸出',
  'audioDrawer.badge.resampling': '重取樣',
  'audioDrawer.badge.soxrResampler': 'SOXR',
  'audioDrawer.badge.speedUp': '加速',
  'audioDrawer.buffer.asio': 'ASIO 緩衝',
  'audioDrawer.buffer.auto': '自動',
  'audioDrawer.buffer.collapsedDescription': '預設收合；點開可調整延遲檔位與 ASIO 緩衝。',
  'audioDrawer.buffer.default': '預設',
  'audioDrawer.buffer.latencyProfile': '延遲檔位',
  'audioDrawer.buffer.low': '低',
  'audioDrawer.buffer.profileDefault': '跟隨檔位預設',
  'audioDrawer.buffer.safer': '更穩',
  'audioDrawer.buffer.stable': '穩定',
  'audioDrawer.buffer.title': '緩衝設定',
  'audioDrawer.buffer.ultraLow': '超低延遲',
  'audioDrawer.device.asioDriver': 'ASIO 驅動',
  'audioDrawer.device.lowLatency': '低延遲',
  'audioDrawer.device.selected': '已選取',
  'audioDrawer.device.systemAudio': '系統音訊',
  'audioDrawer.device.systemDefault': '系統預設',
  'audioDrawer.device.systemDefaultOutput': '系統預設輸出',
  'audioDrawer.device.systemOutput': '系統輸出',
  'audioDrawer.device.systemSelectedRoute': '系統選取路徑',
  'audioDrawer.empty.asioDevices': '找不到 ASIO 輸出裝置。',
  'audioDrawer.empty.hiddenDevices': '沒有隱藏裝置。',
  'audioDrawer.empty.systemDevices': '找不到系統輸出裝置。',
  'audioDrawer.error.desktopBridgeUnavailable': '桌面橋接不可用',
  'audioDrawer.meter.direct': '直通',
  'audioDrawer.meter.chain': '鏈路',
  'audioDrawer.meter.mode': '模式',
  'audioDrawer.meter.output': '輸出',
  'audioDrawer.meter.rate': '取樣率',
  'audioDrawer.meter.resample': '重取樣',
  'audioDrawer.meter.source': '音源',
  'audioDrawer.meter.latency': '延遲',
  'audioDrawer.guard.asioUnavailable.description': '預設關閉。遇到 No device found 後會短暫跳過同一個 ASIO 裝置，並改用安全的共享輸出。',
  'audioDrawer.guard.asioUnavailable.title': 'ASIO 不可用保護',
  'audioDrawer.guard.soxrFallback.description': '預設開啟。如果共享 SOXR 重取樣在 PCM 開始前不可用，會退回到 FFmpeg 預設重取樣。',
  'audioDrawer.guard.soxrFallback.title': 'SOXR 退回保護',
  'audioDrawer.latency.balanced': '均衡',
  'audioDrawer.latency.balancedDetail': '2048 frames',
  'audioDrawer.latency.lowLatency': '低延遲',
  'audioDrawer.latency.lowLatencyDetail': '切歌更快 / 不穩升均衡',
  'audioDrawer.latency.stable': '穩定',
  'audioDrawer.latency.stableDetail': '8192 frames',
  'audioDrawer.mode.exclusive': '獨佔',
  'audioDrawer.mode.exclusiveCandidate': '獨佔候選',
  'audioDrawer.mode.directSound': 'DirectSound 相容',
  'audioDrawer.mode.shared': '共享',
  'audioDrawer.note.asio': '低延遲專業音訊介面，需要驅動支援。',
  'audioDrawer.note.asioWarning': '開啟 ASIO 會占用您的音訊通道；如果沒有原廠或可信 ASIO 驅動，請不要使用，也不建議為了適配 ASIO 安裝來源不明的虛擬驅動，收益有限且可能導致不穩定。',
  'audioDrawer.note.outputResponsibilityTitle': '獨佔 / ASIO 使用提示',
  'audioDrawer.note.outputResponsibilityPrimary': '如果您直推耳機或音響，通常沒有開啟獨佔的必要。如果非要開啟獨佔 / ASIO 後出現問題，而共享模式正常，請先排查 DAC、音效卡、驅動和連接鏈路，不要一遇到就直接判斷為軟體 Bug；如果嫌麻煩，建議使用獨立解碼設備。',
  'audioDrawer.note.outputResponsibilitySecondary': '如果使用獨立解碼後仍有問題，請到 設定 - 播放 重置引擎；若仍無法解決，請在群聊發送錯誤報告。',
  'audioDrawer.note.currentOutput': '這裡顯示現在真正使用的輸出路徑；共享適合日常，ASIO 和 WASAPI 獨佔會以金色標出。',
  'audioDrawer.note.engine': '這裡快速查看輸出裝置、模式、取樣率、EQ 和重取樣狀態。',
  'audioDrawer.note.juceOutput': '預設主輸出。FFmpeg 繼續負責解碼；JUCE 負責輸出，失敗會自動退回相容路徑。',
  'audioDrawer.note.juceDecode': '預設關閉。本機 WAV/FLAC/MP3 在不需重取樣時嘗試 JUCE 解碼；MP3 走 Windows Media，失敗會自動退回 FFmpeg。',
  'audioDrawer.note.dsdDop': '預設關閉。本機 DSF 在獨占或 ASIO 下嘗試 DoP 直出；失敗會自動退回 FFmpeg PCM，最終以 DAC 顯示為準。',
  'audioDrawer.note.asioNativeDsd': '預設關閉。僅 ASIO + 本機 DSF + DoP 開啟且無 EQ/音量/變速/DSP 時嘗試；失敗會退回現有 DoP/PCM。',
  'audioDrawer.note.releaseExclusiveOnPause': '實驗功能。暫停時釋放 WASAPI 獨占，讓其他軟體暫時出聲；恢復播放會重新搶獨占，失敗時暫時降到共享。',
  'audioDrawer.option.juceOutput': 'JUCE 主輸出',
  'audioDrawer.option.juceDecode': 'JUCE 解碼試驗',
  'audioDrawer.option.dsdDop': 'DSD DoP 直出試驗',
  'audioDrawer.option.asioNativeDsd': 'ASIO 原生 DSD 實驗',
  'audioDrawer.option.releaseExclusiveOnPause': '暫停釋放獨占實驗',
  'audioDrawer.option.active': '開啟',
  'audioDrawer.option.set': '設定',
  'audioDrawer.option.automix': '啟用 Automix',
  'audioDrawer.option.automixActive': '目前播放已進入 Automix 預混路徑。',
  'audioDrawer.option.automixDescription': '預設關閉。開啟後會在佇列連續播放時自動把目前歌曲尾段與下一首重疊淡入淡出。',
  'audioDrawer.option.rememberOutput': '儲存輸出設定',
  'audioDrawer.option.rememberOutputDescription': '下次啟動時復原所選輸出裝置、輸出模式與緩衝等參數。',
  'audioDrawer.option.showAsioPanelSettings': '是否顯示 ASIO 面板設定',
  'audioDrawer.option.showAsioPanelSettingsDescription': '預設關閉。開啟後才會在 ASIO 裝置下顯示「開啟 ASIO 面板」按鈕。',
  'audioDrawer.option.directSound': 'DirectSound 相容',
  'audioDrawer.option.directSoundDescription': '手動相容模式，延遲較大；只在 WASAPI 播放異常時嘗試。',
  'audioDrawer.option.sharedBackend': '共享後端',
  'audioDrawer.option.wasapiShared': 'WASAPI Shared',
  'audioDrawer.option.wasapiSharedDescription': '日常 Windows 共享輸出路徑。',
  'audioDrawer.option.wasapiExclusive': 'WASAPI 獨佔模式',
  'audioDrawer.option.wasapiExclusiveDescription': '共享是日常 Windows 輸出路徑。獨佔會要求同一裝置並略過共享混音器，只建議在確認 DAC/音效卡與驅動穩定時使用；Realtek 等板載驅動相容性較差，可能導致無聲、卡頓或切換失敗。',
  'audioDrawer.section.advancedOutput': '進階輸出',
  'audioDrawer.section.automix': 'Automix',
  'audioDrawer.section.asioDevices': 'ASIO 輸出裝置',
  'audioDrawer.section.currentOutput': '目前輸出',
  'audioDrawer.section.hiddenDevices': '隱藏裝置',
  'audioDrawer.section.systemDevices': '系統輸出裝置',
  'audioDrawer.signal.balanceDsp': '平衡 DSP',
  'audioDrawer.signal.bitPerfect': 'Bit-perfect',
  'audioDrawer.signal.dspOn': 'DSP 開啟',
  'audioDrawer.signal.eqOff': 'EQ 關閉',
  'audioDrawer.signal.eqOn': 'EQ 開啟',
  'audioDrawer.signal.asioSdkOutput': 'ASIO SDK 輸出',
  'audioDrawer.signal.ffmpegDecode': 'FFmpeg 解碼',
  'audioDrawer.signal.dsdDop': 'DSF bitstream -> DoP',
  'audioDrawer.signal.dsdDopFallback': 'DSD DoP 已降級',
  'audioDrawer.signal.dsdDopStandby': 'DoP 未適用',
  'audioDrawer.signal.juceDecode': 'JUCE 解碼',
  'audioDrawer.signal.juceDecodeFallback': 'JUCE 解碼已降級',
  'audioDrawer.signal.juceDecodeStandby': 'JUCE 解碼未適用',
  'audioDrawer.signal.nativeRate': '原生取樣率',
  'audioDrawer.signal.noActiveSource': '沒有作用中的音源',
  'audioDrawer.signal.pending': '等待中',
  'audioDrawer.signal.processed': '已處理',
  'audioDrawer.signal.sharedMixer': '共享混音器',
  'audioDrawer.signal.standardPath': '標準路徑',
  'audioDrawer.status.noTrack': '沒有曲目',
  'audioDrawer.status.ratePending': '取樣率待定',
  'audioDrawer.status.sampleRatePending': '取樣率待定',
  'audioDrawer.title': '音訊設定',
  'audioDrawer.todo.outputControls': '目標取樣率與緩衝控制',
  'audioDrawer.todo.outputControlsDescription': 'TODO：等 DeviceService 暴露安全控制後接入真實音訊設定。',
  'audioDrawer.troubleshooting.description': '如果聲音卡住或裝置列表不正常，點這裡。軟重啟不會影響其他應用程式。',
  'audioDrawer.troubleshooting.hardAction': '重啟 Windows 音訊服務',
  'audioDrawer.troubleshooting.hardBusy': '正在重啟 Windows 音訊服務',
  'audioDrawer.troubleshooting.hardConfirm': '這會中斷所有應用程式的聲音（Chrome、遊戲、通話），並需要系統管理員權限。是否繼續？',
  'audioDrawer.troubleshooting.hardDone': 'Windows 音訊服務已恢復，你可以重新開始播放',
  'audioDrawer.troubleshooting.softAction': '重啟音訊引擎',
  'audioDrawer.troubleshooting.softBusy': '正在重啟音訊引擎',
  'audioDrawer.troubleshooting.softDone': '音訊引擎已重啟，你可以重新開始播放',
  'audioDrawer.troubleshooting.title': '音訊故障排除',
  'trackMenu.action.addToPlaylist': '加入播放清單...',
  'trackMenu.action.playNext': '下一首播放',
  'trackMenu.action.addToQueue': '加入佇列',
  'trackMenu.action.like': '喜歡',
  'trackMenu.action.unlike': '取消喜歡',
  'trackMenu.action.removeFromQueue': '從播放佇列移除',
  'trackMenu.action.openOsuTiming': 'osu! Timing',
  'trackMenu.action.editTags': '編輯標籤',
  'trackMenu.action.reloadEmbeddedTags': '重新載入嵌入標籤',
  'trackMenu.action.goToAlbum': '定位到專輯',
  'trackMenu.action.showInFolder': '在資料夾中顯示',
  'trackMenu.action.copyPath': '複製檔案路徑',
  'trackMenu.action.openSystem': '使用系統預設應用程式打開',
  'trackMenu.action.copyNameArtist': '複製歌名與演出者',
  'trackMenu.action.copyCover': '複製歌曲卡片圖片',
  'trackMenu.action.saveCover': '儲存歌曲卡片圖片',
  'trackMenu.action.deleteSong': '刪除歌曲',
  'folders.action.addScan': '加入並掃描',
  'folders.action.browse': '瀏覽',
  'folders.action.cancel': '取消',
  'folders.action.open': '打開',
  'folders.action.play': '播放',
  'folders.action.queue': '加入佇列',
  'folders.action.random': '隨機',
  'folders.action.refresh': '重新整理資料夾',
  'folders.action.remove': '移除',
  'folders.action.scan': '掃描',
  'folders.confirm.deleteTrack': '刪除這個音樂檔？\n{title}',
  'folders.confirm.removeRoot': '從曲庫索引中移除「{name}」？音樂檔會保留在磁碟上。',
  'folders.count.tracks': '{count} 首',
  'folders.detail.importHint': '匯入音樂資料夾後，可以依路徑瀏覽曲庫。',
  'folders.detail.libraryFolders': '曲庫資料夾',
  'folders.detail.root': '根目錄',
  'folders.detail.selectFolder': '選擇資料夾',
  'folders.detail.subfolder': '子資料夾',
  'folders.duration.hours': '{count} 小時',
  'folders.duration.hoursMinutes': '{hours} 小時 {minutes} 分鐘',
  'folders.duration.minutes': '{count} 分鐘',
  'folders.empty.noScan': '這個根目錄還沒有執行過掃描。',
  'folders.empty.roots': '還沒有曲庫資料夾。',
  'folders.error.actionFailed': '資料夾操作失敗。',
  'folders.error.desktopEditTags': '桌面橋接不可用。請在 ECHO Next 桌面端編輯內嵌標籤。',
  'folders.error.desktopFileActions': '桌面橋接不可用。請在 ECHO Next 桌面端使用檔案操作。',
  'folders.error.desktopImport': '桌面橋接不可用。請在 ECHO Next 桌面端匯入資料夾。',
  'folders.error.desktopManage': '桌面橋接不可用。請在 ECHO Next 桌面端管理資料夾。',
  'folders.error.noCoverSaved': '沒有儲存任何封面。',
  'folders.error.noCoverToCopy': '這首歌沒有可複製的封面。',
  'folders.error.notFolder': '選取的路徑不是資料夾。',
  'folders.error.pathMissing': '資料夾路徑不存在。',
  'folders.error.permission': 'ECHO 沒有權限存取這個資料夾。',
  'folders.error.trackActionUnavailable': '這個歌曲操作暫不可用。',
  'folders.filters.includeSubfolders': '包含子資料夾',
  'folders.filters.label': '資料夾歌曲篩選',
  'folders.filters.searchPlaceholder': '搜尋此資料夾...',
  'folders.message.addedToPlaylist': '已加入播放清單：{name}',
  'folders.message.alreadyScanning': '這個曲庫根目錄正在掃描。',
  'folders.message.folderAddedScanStarted': '資料夾已加入，掃描已在背景開始。',
  'folders.message.folderRemoved': '資料夾已從曲庫索引中移除。',
  'folders.message.loadedPartial': '已載入前 {loaded} / {total} 首，避免佔用過多記憶體。',
  'folders.message.loadedTracks': '已載入 {count} 首。',
  'folders.message.noPlayableTracks': '這個資料夾裡沒有可播放歌曲。',
  'folders.message.queuedTracks': '已加入佇列 {count} 首。',
  'folders.message.scanCancelled': '掃描已取消。',
  'folders.message.scanStarted': '掃描已開始。',
  'folders.metrics.duration': '長度',
  'folders.metrics.label': '資料夾指標',
  'folders.metrics.size': '大小',
  'folders.metrics.subfolders': '子資料夾',
  'folders.metrics.tracks': '歌曲',
  'folders.panel.addFolder': '加入資料夾',
  'folders.panel.import': '匯入',
  'folders.panel.manage': '管理',
  'folders.panel.scan': '掃描',
  'folders.panel.selectedRoot': '已選根目錄',
  'folders.panel.status': '狀態',
  'folders.phase.checkingCache': '檢查快取',
  'folders.phase.discovering': '尋找檔案',
  'folders.phase.extractingCovers': '擷取封面',
  'folders.phase.finished': '已完成',
  'folders.phase.groupingAlbums': '整理專輯',
  'folders.phase.readingMetadata': '讀取標籤',
  'folders.phase.writingDatabase': '寫入資料庫',
  'folders.prompt.choosePlaylist': '選擇播放清單編號：\n{names}',
  'folders.prompt.createPlaylist': '還沒有播放清單。輸入名稱來建立一個：',
  'folders.queueSource.recursive': '{name} 資料夾',
  'folders.scan.progress': '{processed}/{total} 個檔案，{errors} 個錯誤',
  'folders.sidebar.kicker': '曲庫',
  'folders.sidebar.title': '資料夾',
  'folders.sort.album': '專輯',
  'folders.sort.artist': '演出者',
  'folders.sort.duration': '長度',
  'folders.sort.quality': '音質',
  'folders.sort.random': '隨機',
  'folders.sort.recent': '最近更新',
  'folders.sort.title': '標題',
  'folders.status.cancelled': '已取消',
  'folders.status.completed': '完成',
  'folders.status.failed': '失敗',
  'folders.status.queued': '排隊中',
  'folders.status.running': '掃描中',
  'folders.statusLine.loadingTracks': '正在讀取資料夾歌曲...',
  'folders.statusLine.preparingQueue': '正在準備資料夾佇列...',
  'route.albums.label': '專輯',
  'route.artists.label': '演出者',
  'route.audioSettings.label': '音訊設定',
  'route.connect.description': 'DLNA / AirPlay 無線播放。',
  'route.connect.label': 'Connect',
  'route.downloads.description': '下載任務佔位。',
  'route.downloads.label': '下載',
  'route.folders.label': '資料夾',
  'route.importFile.label': '匯入檔案',
  'route.importFolder.label': '匯入資料夾',
  'route.liked.label': '喜歡',
  'route.lyrics.description': '歌詞與沉浸播放。',
  'route.lyrics.label': '歌詞',
  'route.lyricsSettings.label': '歌詞設定',
  'route.mvSettings.description': 'MV 綁定與本地匹配設定。',
  'route.mvSettings.label': 'MV 設定',
  'mvSettings.action.chooseFile': '選擇檔案',
  'mvSettings.action.close': '關閉 MV 設定',
  'mvSettings.action.collapseNetwork': '折疊網路來源',
  'mvSettings.action.dragReorder': '拖曳調整優先級',
  'mvSettings.action.dragSource': '拖曳 {provider} 調整優先級',
  'mvSettings.action.expandNetwork': '展開網路來源',
  'mvSettings.action.findLocal': '尋找本地',
  'mvSettings.action.openExternal': '在外部打開已選 MV',
  'mvSettings.action.refresh': '重新整理',
  'mvSettings.action.removeSelected': '移除已選 MV',
  'mvSettings.action.searchNetwork': '搜尋網路 MV',
  'mvSettings.aria.candidates': 'MV 候選列表',
  'mvSettings.aria.drawer': 'MV 設定',
  'mvSettings.aria.engineStatus': 'MV 引擎狀態',
  'mvSettings.aria.maxQuality': '最高畫質 {quality}',
  'mvSettings.aria.maxQualityOptions': '最高畫質選項',
  'mvSettings.aria.networkSources': '網路來源優先級',
  'mvSettings.aria.selectedQuality': '已選 MV 畫質 {quality}',
  'mvSettings.aria.selectedQualityOptions': '已選 MV 畫質選項',
  'mvSettings.badge.credentialsMain': '憑證保留在主行程',
  'mvSettings.badge.proxyOnly': '僅代理存取',
  'mvSettings.binding.selectedMv': '已選 MV',
  'mvSettings.binding.title': 'MV 來源',
  'mvSettings.candidate.external': '外部',
  'mvSettings.candidate.inApp': '應用內',
  'mvSettings.custom.apply': '套用自訂 MV',
  'mvSettings.custom.description': '貼上 YouTube 或 Bilibili 影片連結作為目前 MV。',
  'mvSettings.custom.directDash': '直連串流（DASH）',
  'mvSettings.custom.input': '自訂 MV 連結',
  'mvSettings.custom.placeholder': 'https://youtube.com/watch?v=... 或 BVxxxxxxxx',
  'mvSettings.custom.playing': '正在播放：{provider} - {sourceId}',
  'mvSettings.custom.title': '自訂 MV',
  'mvSettings.custom.videoTitle': '影片標題：{title}',
  'mvSettings.engine.mvTitle': 'MV 標題',
  'mvSettings.engine.network': '網路',
  'mvSettings.engine.quality': '畫質',
  'mvSettings.engine.selected': '已選',
  'mvSettings.engine.title': 'MV 引擎',
  'mvSettings.error.noActiveTrackBinding': '沒有可用於 MV 綁定的目前曲庫歌曲',
  'mvSettings.error.noActiveTrackMatching': '沒有可用於 MV 匹配的目前曲庫歌曲',
  'mvSettings.error.noActiveTrackNetworkSearch': '沒有可用於網路 MV 搜尋的目前曲庫歌曲',
  'mvSettings.error.noLocalCandidates': '沒有找到本地 MV 候選',
  'mvSettings.error.noNetworkCandidates': '沒有找到網路 MV 候選',
  'mvSettings.general.enabled': '啟用 MV',
  'mvSettings.immersive.blur': '毛玻璃模糊',
  'mvSettings.immersive.brightness': '背景亮度',
  'mvSettings.immersive.description': '開啟後，歌詞頁使用目前 MV 作為背景。',
  'mvSettings.immersive.dragHint': '也可以在歌詞頁空白處拖動調整。',
  'mvSettings.immersive.lyricsReadability': '歌詞可讀性增強',
  'mvSettings.immersive.lyricsReadabilityDescription': '為沉浸式 MV 上的歌詞增加描邊和投影。',
  'mvSettings.immersive.overlay': '暗色遮罩',
  'mvSettings.immersive.overlayHint': '越低越接近原片，越高歌詞越清晰。',
  'mvSettings.immersive.positionX': '橫向位置',
  'mvSettings.immersive.positionY': '縱向位置',
  'mvSettings.immersive.reset': '重置沉浸式背景',
  'mvSettings.immersive.title': '沉浸式 MV 背景',
  'mvSettings.immersive.visualHint': '用於調整沉浸式背景觀感。',
  'mvSettings.immersive.zoom': '背景縮放',
  'mvSettings.network.autoApply': '自動搜尋網路 MV',
  'mvSettings.network.autoApplyThreshold': '自動套用匹配度',
  'mvSettings.network.autoApplyThresholdDescription': '候選達到 {threshold} 以上才會自動套用。',
  'mvSettings.network.autoPreload': '是否預載 MV',
  'mvSettings.network.autoPreloadDescription': '開啟後，只要播放歌曲就會嘗試提前查找並準備目前歌曲的 MV。',
  'mvSettings.network.maxQuality': '最高畫質',
  'mvSettings.network.replayAudioOnChange': '切換 MV 後自動重播音樂',
  'mvSettings.network.replayAudioOnChangeDescription': '開啟後，手動選擇或綁定新的 MV 會重新播放目前歌曲，讓新 MV 立即生效。',
  'mvSettings.network.restartAudioOnLoad': 'MV 跟隨音樂進度',
  'mvSettings.network.restartAudioOnLoadDescription': '開啟後，只校準 MV 影片時間，不會 seek 或重啟音訊；歌詞同步偏移不會影響 MV。',
  'mvSettings.network.title': '網路來源',
  'mvSettings.offset.aria': 'MV 同步延遲',
  'mvSettings.offset.description': '只儲存到目前這首歌的 MV；換歌後不會影響其他歌曲。',
  'mvSettings.offset.earlier': 'MV 提前 {value}',
  'mvSettings.offset.later': 'MV 延後 {value}',
  'mvSettings.offset.reset': '重置 MV 延遲',
  'mvSettings.offset.title': '本歌曲 MV 延遲',
  'mvSettings.provider.local': '本地',
  'mvSettings.quality.max': '最高',
  'mvSettings.search.input': 'MV 搜尋關鍵字',
  'mvSettings.search.placeholder': '輸入 MV 搜尋關鍵字',
  'mvSettings.search.useCurrentSong': '使用目前歌曲和歌手搜尋',
  'mvSettings.status.auto': '自動',
  'mvSettings.status.noActiveTrack': '沒有目前歌曲',
  'mvSettings.status.none': '無',
  'mvSettings.status.off': '關閉',
  'mvSettings.status.on': '開啟',
  'mvSettings.title': 'MV 設定',
  'route.playlists.label': '播放清單',
  'route.queue.label': '佇列',
  'queue.action.clear': '清空佇列',
  'queue.action.dragLabel': '拖曳 {title}',
  'queue.action.dragTitle': '拖曳排序',
  'queue.action.generateFromHistory': '依播放歷史產生佇列',
  'queue.action.generateRandom': '產生隨機佇列',
  'queue.action.generatingHistory': '產生中',
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
  'queue.error.noHistoryTracks': '還沒有可用來產生佇列的播放歷史。',
  'queue.error.noRandomTracks': '曲庫裡還沒有可加入隨機佇列的歌曲。',
  'queue.header.kicker': '播放佇列',
  'queue.header.title': '佇列',
  'queue.historySource': '歷史常聽',
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
  'route.songs.label': '曲目',
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
  'settings.eq.action.autoPreamp': '自動 {value}',
  'settings.eq.action.delete': '刪除',
  'settings.eq.action.holdBypass': '按住旁路 EQ',
  'settings.eq.action.resetChannelBalance': '重置聲道平衡',
  'settings.eq.action.save': '儲存',
  'settings.eq.bitPerfect.channelDisabled': 'DSP 已啟用：bit-perfect 已關閉。',
  'settings.eq.bitPerfect.disabled': 'DSP 已啟用：bit-perfect 已關閉{reason}。',
  'settings.eq.channel.active': '啟用',
  'settings.eq.channel.center': '置中',
  'settings.eq.channel.constantPower': '恆定功率',
  'settings.eq.channel.description': 'Balance 用於左右偏移；L/R Gain 用於精細校正；Mono Sum 用於單聲道檢查；Invert 用於相位檢查。',
  'settings.eq.channel.invertLeft': '左聲道反相',
  'settings.eq.channel.invertRight': '右聲道反相',
  'settings.eq.channel.mono.off': '關閉',
  'settings.eq.channel.mono.sum': '合併',
  'settings.eq.channel.title': '聲道平衡',
  'settings.eq.curve.aria': '可拖動 10 段 EQ 頻響曲線',
  'settings.eq.curve.dragBand': '拖動 {frequency} EQ 頻段',
  'settings.eq.error.bridgeChannelBalance': '桌面橋接不可用。請在 ECHO Next 桌面端控制聲道平衡。',
  'settings.eq.error.bridgeControlEq': '桌面橋接不可用。請在 ECHO Next 桌面端控制 EQ。',
  'settings.eq.error.bridgeDeletePreset': '桌面橋接不可用。請在 ECHO Next 桌面端刪除 EQ 預設。',
  'settings.eq.error.bridgeSavePreset': '桌面橋接不可用。請在 ECHO Next 桌面端儲存 EQ 預設。',
  'settings.eq.error.presetName': '請輸入預設名稱。',
  'settings.eq.preamp.safeHeadroom': '安全餘量',
  'settings.eq.preset.readonly': '內建預設為唯讀。',
  'settings.eq.preset.savePlaceholder': '儲存為使用者預設',
  'settings.eq.status.clippingRisk': '削波風險',
  'settings.eq.status.headroom': '餘量',
  'settings.eq.status.safeHeadroomShort': '安全餘量',
  'settings.eq.title': '10 段圖示 EQ',
  'settings.eq.warning.channelClipping': '存在削波風險：降低增益或前級可獲得更安全的餘量。',
  'settings.eq.warning.lowerPreamp': '降低前級可避免削波。',
  'settings.general.closeToTray': '關閉時隱藏到系統匣',
  'settings.general.backup.title': '設定參數備份',
  'settings.general.backup.export': '匯出設定',
  'settings.general.backup.import': '匯入設定',
  'settings.playback.outputMode.title': '輸出模式',
  'settings.playback.speedMode.description': '選擇播放器底部速度滑桿使用的變速方式。',
  'settings.playback.speedMode.title': '變速模式',
  'settings.playback.outputDevice.title': '輸出裝置',
  'settings.playback.outputDevice.empty': '沒有可用裝置',
  'settings.playback.sharedBackend.description': 'DirectSound 只作為手動相容模式，延遲較大；日常播放保持 WASAPI Shared。',
  'settings.playback.sharedBackend.directSound': 'DirectSound 相容',
  'settings.playback.sharedBackend.title': '共享後端',
  'settings.playback.sharedBackend.wasapi': 'WASAPI Shared',
  'settings.playback.resetEngine.action': '重啟音訊引擎',
  'settings.playback.resetEngine.busy': '正在重啟',
  'settings.playback.resetEngine.description': '停止目前播放並釋放 native 音訊主機；裝置或驅動卡住時可先試這個，不必重開軟體。',
  'settings.playback.resetEngine.done': '音訊引擎已重啟，你可以重新開始播放',
  'settings.playback.resetEngine.title': '重啟音訊引擎',
  'settings.playback.troubleshooting.description': '如果聲音卡住或裝置列表不正常，點這裡。軟重啟不會影響其他應用程式。',
  'settings.playback.troubleshooting.hardAction': '重啟 Windows 音訊服務',
  'settings.playback.troubleshooting.hardBusy': '正在重啟 Windows 音訊服務',
  'settings.playback.troubleshooting.hardConfirm': '這會中斷所有應用程式的聲音（Chrome、遊戲、通話），並需要系統管理員權限。是否繼續？',
  'settings.playback.troubleshooting.hardDone': 'Windows 音訊服務已恢復，你可以重新開始播放',
  'settings.playback.troubleshooting.softAction': '重啟音訊引擎',
  'settings.playback.troubleshooting.softBusy': '正在重啟音訊引擎',
  'settings.playback.troubleshooting.softDone': '音訊引擎已重啟，你可以重新開始播放',
  'settings.playback.troubleshooting.title': '音訊故障排除',
  'settings.playback.wireless.title': '無線播放',
  'settings.playback.audioStatus.title': '音訊狀態',
  'settings.playback.audioStatus.description': '取樣率欄位必須分開顯示，避免舊 ECHO 獨占模式 48k 鎖死回歸。',
  'settings.playback.automix.description': '預設關閉。開啟後，連續佇列會提前準備下一首，並用原生雙 Deck 引擎避開尾端空白、智慧銜接切歌。',
  'settings.playback.automix.title': 'Automix 智慧過渡',
  'settings.playback.stability.action.copied': '已複製',
  'settings.playback.stability.action.copy': '複製診斷資訊',
  'settings.playback.stability.action.refresh': '重新整理播放穩定性診斷',
  'settings.playback.stability.error.desktopBridgeUnavailable': '桌面橋接不可用。',
  'settings.playback.stability.field.lastSharedStabilityRecoveryAt': '上次 Shared 穩定性復原時間',
  'settings.playback.stability.field.lastWatchdogRecoveryTime': '上次 watchdog 復原時間',
  'settings.playback.stability.field.nativeBufferedFrames': 'Native 緩衝影格',
  'settings.playback.stability.field.nativeBufferedMs': 'Native 緩衝毫秒',
  'settings.playback.stability.field.nativeDeviceBufferFrames': '裝置緩衝影格',
  'settings.playback.stability.field.nativeFifoCapacityFrames': 'Native FIFO 容量影格',
  'settings.playback.stability.field.nativeStartupPrebufferFrames': '啟動預緩衝影格',
  'settings.playback.stability.field.nativeUnderrunCallbacks': 'Native underrun 回呼',
  'settings.playback.stability.field.nativeUnderrunFrames': 'Native underrun 影格',
  'settings.playback.stability.field.recentWatchdogRecoveryCount': '近期 watchdog 復原次數',
  'settings.playback.stability.field.sharedStabilityTier': 'Shared 穩定性檔位',
  'settings.playback.stability.field.watchdogStatus': 'watchdog 狀態',
  'settings.playback.stability.title': '播放穩定性診斷',
  'settings.playback.stability.value.unknown': '未知',
  'settings.integrations.discord.action.refresh': '重新整理狀態',
  'settings.integrations.discord.title': 'Discord 狀態',
  'settings.integrations.smtc.description': '把目前播放資訊、封面、進度和媒體鍵動作發布到 Windows 音量浮層與鎖定畫面媒體控制。',
  'settings.integrations.smtc.title': 'Windows 媒體控制',
  'settings.integrations.lastfm.action.completeAuth': '完成授權',
  'settings.integrations.lastfm.action.connect': '連接 Last.fm',
  'settings.integrations.lastfm.action.disconnect': '斷開連接',
  'settings.integrations.lastfm.action.refresh': '重新整理狀態',
  'settings.integrations.lastfm.activeProgress': '{artist} - {title} · {played}/{threshold} 秒',
  'settings.integrations.lastfm.activeTrack': '目前曲目',
  'settings.integrations.lastfm.connection.description': '建議使用瀏覽器授權。在 Last.fm 點 Allow 後，回到 ECHO Next 完成授權。',
  'settings.integrations.lastfm.connection.title': 'Last.fm 連接',
  'settings.integrations.lastfm.description': '在主行程記錄本地播放，不傳送檔案路徑、歌詞或封面。',
  'settings.integrations.lastfm.lastNowPlaying': '上次 Now Playing',
  'settings.integrations.lastfm.lastScrobble': '上次 Scrobble',
  'settings.integrations.lastfm.never': '尚未傳送',
  'settings.integrations.lastfm.noActiveTrack': '沒有活躍曲目',
  'settings.integrations.lastfm.nowPlaying.description': '開始播放時傳送一次目前曲目資訊。',
  'settings.integrations.lastfm.nowPlaying.title': 'Last.fm Now Playing',
  'settings.integrations.lastfm.scrobbling.description': '曲目達到 Last.fm 記錄門檻後提交播放記錄。',
  'settings.integrations.lastfm.scrobbling.title': 'Last.fm Scrobbling',
  'settings.integrations.lastfm.status.connected': '已連接 {username}',
  'settings.integrations.lastfm.status.error': '錯誤：{error}',
  'settings.integrations.lastfm.status.notConnected': '未連接',
  'settings.integrations.lastfm.status.pending': '等待完成授權',
  'settings.integrations.lastfm.statusLabel': '狀態',
  'settings.integrations.lastfm.title': 'Last.fm',
  'settings.integrations.mobile.title': '手機遙控',
  'settings.remote.library.title': '遠端音樂庫',
  'settings.remote.library.description': '本階段禁止網路硬碟 / 遠端 / 串流，只保留設定分組佔位。',
  'settings.eq.action.hideAdvanced': '隱藏進階',
  'settings.eq.action.showAdvanced': '進階',
  'settings.eq.ab.summary': '{preset} / 峰值 {peak} / 輸出 {output} / 前級 {preamp}',
  'settings.eq.level.clips': '削波 {count}',
  'settings.eq.level.estimatedOutputPeak': '估算輸出峰值',
  'settings.eq.level.headroom': '餘量',
  'settings.eq.level.inputPeak': '輸入峰值',
  'settings.eq.level.inputRms': '輸入 RMS',
  'settings.eq.level.sourceEstimate': 'pre-native + DSP 估算',
  'settings.appearance.theme.title': '主題',
  'settings.appearance.theme.description': '選擇淺色、深色，或跟隨系統外觀。',
  'settings.appearance.theme.light': '淺色',
  'settings.appearance.theme.dark': '深色',
  'settings.appearance.theme.followSystem': '跟隨系統',
  'settings.appearance.themePreset.title': '主題預設',
  'settings.appearance.themePreset.description': '選擇一套全域漸層色板；目前的明暗模式仍會保留。',
  'settings.appearance.themePreset.classic': '經典 ECHO Next',
  'settings.appearance.themePreset.classic.description': '保持目前清爽的藍灰質感。',
  'settings.appearance.themePreset.echoTwilight': '暮光桃霧',
  'settings.appearance.themePreset.echoTwilight.description': '老版 ECHO 的暖粉漸層感。',
  'settings.appearance.themePreset.sakuraMilk': '櫻粉奶霜',
  'settings.appearance.themePreset.sakuraMilk.description': '奶白粉底配櫻桃紅強調。',
  'settings.appearance.themePreset.peachSoda': '蜜桃蘇打',
  'settings.appearance.themePreset.peachSoda.description': '蜜桃橙和蘇打青的輕快組合。',
  'settings.appearance.themePreset.mintCandy': '薄荷軟糖',
  'settings.appearance.themePreset.mintCandy.description': '薄荷綠、奶油白和一點桃粉。',
  'settings.appearance.themePreset.berryDream': '藍莓星糖',
  'settings.appearance.themePreset.berryDream.description': '莓紫雲白，帶一點夢幻粉光。',
  'settings.appearance.themePreset.matchaCream': '抹茶奶油',
  'settings.appearance.themePreset.matchaCream.description': '抹茶綠和奶油黃，更安靜耐看。',
  'settings.appearance.themePreset.lemonMochi': '檸檬麻糬',
  'settings.appearance.themePreset.lemonMochi.description': '奶黃和天藍，像柔軟的檸檬點心。',
  'settings.appearance.themePreset.cottonCloud': '棉花雲朵',
  'settings.appearance.themePreset.cottonCloud.description': '雲白藍配柔粉，明亮但不刺眼。',
  'settings.appearance.themePreset.melonCream': '哈密瓜奶霜',
  'settings.appearance.themePreset.melonCream.description': '蜜瓜綠與奶油底，清甜且易讀。',
  'settings.appearance.themePreset.seaSaltJelly': '海鹽果凍',
  'settings.appearance.themePreset.seaSaltJelly.description': '海鹽青配蜜桃光，清透但壓得住文字。',
  'settings.appearance.themePreset.caramelPudding': '焦糖布丁',
  'settings.appearance.themePreset.caramelPudding.description': '奶油焦糖配草莓光，甜但不膩。',
  'settings.appearance.themePreset.neonCandy': '霓虹糖果',
  'settings.appearance.themePreset.neonCandy.description': '紫色霓虹、粉色高光和薄荷泡泡。',
  'settings.appearance.themePreset.nyanCat': 'Nyan Cat',
  'settings.appearance.themePreset.nyanCat.description': '慢速流動的可愛彩虹漸層，進度條會帶著彩虹貓一起跑。',
  'settings.appearance.themePreset.wisteriaBubble': '紫藤泡泡',
  'settings.appearance.themePreset.wisteriaBubble.description': '紫藤花霧配薄荷泡泡，夢幻但清爽。',
  'settings.appearance.themePreset.strawberryCookie': '草莓餅乾',
  'settings.appearance.themePreset.strawberryCookie.description': '奶油餅乾底配草莓紅和烘焙金。',
  'settings.appearance.themePreset.graphiteAurora': '石墨極光',
  'settings.appearance.themePreset.graphiteAurora.description': '石墨灰裡帶一點青綠極光，冷靜但有層次。',
  'settings.appearance.themePreset.amberNoir': '琥珀夜色',
  'settings.appearance.themePreset.amberNoir.description': '黑金唱片廳感，適合暗色長聽。',
  'settings.appearance.themePreset.oceanStudio': '海岸錄音室',
  'settings.appearance.themePreset.oceanStudio.description': '冷藍灰和海霧藍，乾淨專業。',
  'settings.appearance.themePreset.rosewoodVinyl': '玫瑰木黑膠',
  'settings.appearance.themePreset.rosewoodVinyl.description': '木質暖紅與黑膠暗調，更沉穩復古。',
  'settings.appearance.themePreset.darkSideMoon': 'The Dark Side of the Moon',
  'settings.appearance.themePreset.darkSideMoon.description': '致敬 Pink Floyd：黑月、白色稜鏡與彩虹光譜。',
  'settings.appearance.themePreset.shibuyaNight': '澀谷夜色',
  'settings.appearance.themePreset.shibuyaNight.description': '東京霓虹、夜紫街口和青色招牌光。',
  'settings.appearance.themePreset.kyotoKurenai': '京都朱印',
  'settings.appearance.themePreset.kyotoKurenai.description': '鳥居朱紅、和紙暖底和御守金色。',
  'settings.appearance.themePreset.ukiyoIndigo': '浮世靛藍',
  'settings.appearance.themePreset.ukiyoIndigo.description': '浮世繪海浪的靛藍、紙色和古金。',
  'settings.appearance.themePreset.fujiSnow': '富士初雪',
  'settings.appearance.themePreset.fujiSnow.description': '雪白、富士藍與淡櫻高光，清澈冷甜。',
  'settings.appearance.themePreset.matsuriLantern': '祭燈金魚',
  'settings.appearance.themePreset.matsuriLantern.description': '夏祭燈籠紅、夜市金光和溫暖紙色。',
  'settings.appearance.themePreset.ginzaNoir': '銀座黑曜',
  'settings.appearance.themePreset.ginzaNoir.description': '黑曜石、香檳金和櫥窗藍，成熟一點。',
  'settings.appearance.themePreset.frostJazz': '霜林爵士',
  'settings.appearance.themePreset.frostJazz.description': '冷藍爵士底色，帶一抹梅紫舞台光。',
  'settings.appearance.themeCustom.title': '自訂目前主題',
  'settings.appearance.themeCustom.description': '先選一個主題，再微調顏色；每個主題都會記住自己的自訂。',
  'settings.appearance.themeCustom.action.autoFix': '自動修正文字',
  'settings.appearance.themeCustom.action.export': '匯出參數',
  'settings.appearance.themeCustom.action.import': '匯入參數',
  'settings.appearance.themeCustom.action.reset': '重置目前自訂',
  'settings.appearance.themeCustom.action.save': '儲存自訂',
  'settings.appearance.themeCustom.advanced.show': '展開進階顏色',
  'settings.appearance.themeCustom.advanced.hide': '收起進階顏色',
  'settings.appearance.themeCustom.field.appBg': '底色',
  'settings.appearance.themeCustom.field.appBg2': '漸層中段',
  'settings.appearance.themeCustom.field.appBg3': '漸層尾色',
  'settings.appearance.themeCustom.field.panel': '玻璃色調',
  'settings.appearance.themeCustom.field.panelSoft': '柔面板',
  'settings.appearance.themeCustom.field.accent': '主強調色',
  'settings.appearance.themeCustom.field.accentStrong': '次強調色',
  'settings.appearance.themeCustom.field.secondary': '第三強調色',
  'settings.appearance.themeCustom.field.heading': '主文字',
  'settings.appearance.themeCustom.field.text': '正文文字',
  'settings.appearance.themeCustom.field.muted': '次要文字',
  'settings.appearance.themeCustom.field.border': '邊界色',
  'settings.appearance.themeCustom.field.onAccent': '強調按鈕文字',
  'settings.appearance.themeCustom.field.buttonText': '一般按鈕文字',
  'settings.appearance.themeCustom.field.panelOpacity': '面板透明度',
  'settings.appearance.themeCustom.field.glass': '玻璃感',
  'settings.appearance.themeCustom.field.shadow': '陰影強度',
  'settings.appearance.themeCustom.field.appBg.description': '主視窗底色',
  'settings.appearance.themeCustom.field.appBg2.description': '背景漸層的柔光中段',
  'settings.appearance.themeCustom.field.appBg3.description': '背景漸層的末端停靠色',
  'settings.appearance.themeCustom.field.panel.description': '面板磨砂著色',
  'settings.appearance.themeCustom.field.panelSoft.description': '側欄和弱層級面板',
  'settings.appearance.themeCustom.field.accent.description': '主要互動',
  'settings.appearance.themeCustom.field.accentStrong.description': '漸層與層次',
  'settings.appearance.themeCustom.field.secondary.description': '高光點綴',
  'settings.appearance.themeCustom.field.heading.description': '標題與主文案',
  'settings.appearance.themeCustom.field.text.description': '正文、歌手和設定文案',
  'settings.appearance.themeCustom.field.muted.description': '輔助說明',
  'settings.appearance.themeCustom.field.border.description': '卡片邊框和分隔線',
  'settings.appearance.themeCustom.field.onAccent.description': '強調按鈕上的文字',
  'settings.appearance.themeCustom.field.buttonText.description': '一般按鈕和晶片文字',
  'settings.appearance.themeCustom.field.panelOpacity.description': '面板露出背景的程度',
  'settings.appearance.themeCustom.field.glass.description': '背景模糊和玻璃層次',
  'settings.appearance.themeCustom.field.shadow.description': '卡片、彈窗和播放器投影',
  'settings.appearance.themeCustom.preview.title': '正在編輯',
  'settings.appearance.themeCustom.preview.description': '改動會先即時預覽，儲存後才寫入設定。',
  'settings.appearance.themeCustom.group.core': '常用顏色',
  'settings.appearance.themeCustom.group.core.description': '老 ECHO 式主色板，改這裡最直觀。',
  'settings.appearance.themeCustom.group.gradient': '背景漸層',
  'settings.appearance.themeCustom.group.gradient.description': '控制老 ECHO 那種視窗底色漸層氛圍。',
  'settings.appearance.themeCustom.group.advanced': '進階細節',
  'settings.appearance.themeCustom.group.advanced.description': '更細的文字、邊界和按鈕文字顏色。',
  'settings.appearance.themeCustom.message.exported': '已匯出目前主題參數。',
  'settings.appearance.themeCustom.message.imported': '已匯入主題參數並套用。',
  'settings.appearance.themeCustom.message.importFailed': '匯入失敗，請選擇 ECHO 主題參數 JSON。',
  'settings.appearance.themeCustom.message.fixed': '已自動調整文字與按鈕顏色。',
  'settings.appearance.themeCustom.message.invalidColor': '請輸入 #RRGGBB 格式的安全顏色。',
  'settings.appearance.themeCustom.message.lowContrast': '目前文字對比不足，請先自動修正或調深文字後再儲存。',
  'settings.appearance.themeCustom.message.reset': '已重置目前主題的自訂。',
  'settings.appearance.themeCustom.message.saved': '已儲存目前主題自訂。',
  'settings.appearance.density.title': '介面密度',
  'settings.appearance.density.compact': '緊湊',
  'settings.appearance.density.standard': '標準',
  'settings.appearance.artistAvatars.action.clear': '清除頭像快取',
  'settings.appearance.artistAvatars.action.queueing': '加入佇列中...',
  'settings.appearance.artistAvatars.action.refreshMissing': '重新整理缺失頭像',
  'settings.appearance.artistAvatars.description': '在背景慢速取得真實歌手頭像，並在藝術家牆重複使用本機快取圖片。',
  'settings.appearance.artistAvatars.fallback': '搜尋不到時使用藝術家的專輯封面',
  'settings.appearance.artistAvatars.message.cleared': '已清除 {removedRows} 筆頭像記錄和 {deletedFiles} 個檔案。',
  'settings.appearance.artistAvatars.message.desktopBridgeClear': '桌面橋接不可用。請在 Electron 中開啟 ECHO Next 以清除歌手頭像。',
  'settings.appearance.artistAvatars.message.desktopBridgeRefresh': '桌面橋接不可用。請在 Electron 中開啟 ECHO Next 以重新整理歌手頭像。',
  'settings.appearance.artistAvatars.message.enableFirst': '請先開啟自動取得歌手頭像。',
  'settings.appearance.artistAvatars.message.queued': '已加入 {queued} 個歌手頭像。略過 {skipped} 個。',
  'settings.appearance.artistAvatars.title': '歌手頭像',
  'settings.appearance.artistAvatars.toggle': '自動取得歌手頭像',
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
  'library.action.refresh': '更新',
  'library.albums.card.tracks': '{count} 曲',
  'library.albums.error.desktopBridge': 'デスクトップブリッジを利用できません。ECHO Next デスクトップ版でアルバムを読み込んでください。',
  'library.albums.listAria': 'アルバム一覧',
  'library.albums.loading': 'アルバムを読み込み中...',
  'library.albums.searchPlaceholder': 'アルバム / アーティストを検索',
  'library.albums.sort.aria': 'アルバムの並び替え',
  'library.albums.sort.artist': 'アーティスト',
  'library.albums.sort.titleAsc': 'タイトル A-Z',
  'library.albums.sort.titleDesc': 'タイトル Z-A',
  'library.albums.title': 'アルバム',
  'library.artists.error.desktopBridge': 'デスクトップブリッジを利用できません。ECHO Next デスクトップ版でアーティストを読み込んでください。',
  'library.artists.avatarPriority': '画像優先',
  'library.artists.listAria': 'アーティスト一覧',
  'library.artists.loading': 'アーティストを読み込み中...',
  'library.artists.meta.albums': '{count} アルバム',
  'library.artists.meta.noTracks': '曲なし',
  'library.artists.meta.tracks': '{count} 曲',
  'library.artists.searchPlaceholder': 'アーティストを検索',
  'library.artists.sort.aria': 'アーティストの並び替え',
  'library.artists.sort.frequent': '曲数が多い順',
  'library.artists.sort.nameAsc': '名前 A-Z',
  'library.artists.sort.nameDesc': '名前 Z-A',
  'library.artists.title': 'アーティスト',
  'library.count.total': '全 {count} 件',
  'library.sort.createdAsc': '作成が古い順',
  'library.sort.createdDesc': '作成が新しい順',
  'library.sort.default': 'デフォルト',
  'library.sort.durationAsc': '短い順',
  'library.sort.durationDesc': '長い順',
  'library.sort.fileModifiedAsc': 'ファイル更新が古い順',
  'library.sort.fileModifiedDesc': 'ファイル更新が新しい順',
  'library.sort.random': 'ランダム',
  'library.sort.recent': '最近',
  'library.source.aria': 'ライブラリソース',
  'library.source.local': 'ローカル',
  'library.source.remote': 'クラウド',
  'app.navigation.main': 'メインナビゲーション',
  'app.navigation.utility': 'ユーティリティナビゲーション',
  'app.toolbar.quickActions': 'クイック操作',
  'app.toolbar.windowControls': 'ウィンドウ操作',
  'app.window.minimize': '最小化',
  'app.window.maximize': '最大化',
  'app.window.close': '閉じる',
  'audioDrawer.action.close': '音声設定を閉じる',
  'audioDrawer.action.copiedDiagnostics': '再生診断情報をコピーしました',
  'audioDrawer.action.copyDiagnostics': '再生診断情報をコピー',
  'audioDrawer.action.hideDevice': 'デバイスを非表示',
  'audioDrawer.action.openAsioPanel': 'ASIO パネルを開く',
  'audioDrawer.action.resetEngine': '音声エンジンをリセット',
  'audioDrawer.action.resetEngineBusy': '音声エンジンをリセット中',
  'audioDrawer.action.resetEngineDone': '音声エンジンをリセットしました',
  'audioDrawer.action.restore': '戻す',
  'audioDrawer.asioLatency.description': '現在開いているバッファーから、出力側で再生までに待つ時間を見積もります。低いほど反応が速く、高いほど安定して音切れしにくくなります。',
  'audioDrawer.asioLatency.recommended': '推奨レイテンシ',
  'audioDrawer.asioLatency.status': '要求 {requested} frames / オープン {opened} frames',
  'audioDrawer.asioLatency.value': '{value} ms',
  'audioDrawer.asioRoutes.title': 'ASIO 出力チャンネル',
  'audioDrawer.badge.bitPerfectReady': 'Bit-perfect 対応',
  'audioDrawer.badge.dspActive': 'DSP 有効',
  'audioDrawer.badge.juceFallback': 'JUCE フォールバック',
  'audioDrawer.badge.juceOutput': 'JUCE 出力',
  'audioDrawer.badge.resampling': 'リサンプル',
  'audioDrawer.badge.soxrResampler': 'SOXR',
  'audioDrawer.badge.speedUp': '速度アップ',
  'audioDrawer.buffer.asio': 'ASIO バッファー',
  'audioDrawer.buffer.auto': '自動',
  'audioDrawer.buffer.collapsedDescription': '既定では折りたたみます。開くとレイテンシプロファイルと ASIO バッファーを調整できます。',
  'audioDrawer.buffer.default': '既定',
  'audioDrawer.buffer.latencyProfile': 'レイテンシプロファイル',
  'audioDrawer.buffer.low': '低',
  'audioDrawer.buffer.profileDefault': 'プロファイル既定',
  'audioDrawer.buffer.safer': '安全寄り',
  'audioDrawer.buffer.stable': '安定',
  'audioDrawer.buffer.title': 'バッファー設定',
  'audioDrawer.buffer.ultraLow': '超低遅延',
  'audioDrawer.device.asioDriver': 'ASIO ドライバー',
  'audioDrawer.device.lowLatency': '低遅延',
  'audioDrawer.device.selected': '選択中',
  'audioDrawer.device.systemAudio': 'システム音声',
  'audioDrawer.device.systemDefault': 'システム既定',
  'audioDrawer.device.systemDefaultOutput': 'システム既定出力',
  'audioDrawer.device.systemOutput': 'システム出力',
  'audioDrawer.device.systemSelectedRoute': 'システム選択ルート',
  'audioDrawer.empty.asioDevices': 'ASIO 出力デバイスが見つかりません。',
  'audioDrawer.empty.hiddenDevices': '非表示デバイスはありません。',
  'audioDrawer.empty.systemDevices': 'システム出力デバイスが見つかりません。',
  'audioDrawer.error.desktopBridgeUnavailable': 'デスクトップブリッジを利用できません',
  'audioDrawer.meter.direct': 'ダイレクト',
  'audioDrawer.meter.chain': 'チェーン',
  'audioDrawer.meter.mode': 'モード',
  'audioDrawer.meter.output': '出力',
  'audioDrawer.meter.rate': 'レート',
  'audioDrawer.meter.resample': 'リサンプル',
  'audioDrawer.meter.source': 'ソース',
  'audioDrawer.meter.latency': 'レイテンシ',
  'audioDrawer.guard.asioUnavailable.description': '既定ではオフです。No device found の後、同じ ASIO デバイスを短時間スキップし、安全な共有出力を使います。',
  'audioDrawer.guard.asioUnavailable.title': 'ASIO 不可時ガード',
  'audioDrawer.guard.soxrFallback.description': '既定ではオンです。共有 SOXR リサンプルが PCM 開始前に使えない場合、FFmpeg 既定のリサンプルに戻します。',
  'audioDrawer.guard.soxrFallback.title': 'SOXR フォールバックガード',
  'audioDrawer.latency.balanced': 'バランス',
  'audioDrawer.latency.balancedDetail': '2048 frames',
  'audioDrawer.latency.lowLatency': '低遅延',
  'audioDrawer.latency.lowLatencyDetail': '高速切替 / 不安定時は安定化',
  'audioDrawer.latency.stable': '安定',
  'audioDrawer.latency.stableDetail': '8192 frames',
  'audioDrawer.mode.exclusive': '排他',
  'audioDrawer.mode.exclusiveCandidate': '排他候補',
  'audioDrawer.mode.directSound': 'DirectSound 互換',
  'audioDrawer.mode.shared': '共有',
  'audioDrawer.note.asio': '低遅延のプロ向け音声インターフェイスです。ドライバー対応が必要です。',
  'audioDrawer.note.asioWarning': 'ASIO を有効にすると音声チャンネルを占有します。メーカー純正または信頼できる ASIO ドライバーがない場合は使わないでください。ASIO 対応のために出所不明の仮想ドライバーを入れることも推奨しません。効果は限定的で、不安定になる可能性があります。',
  'audioDrawer.note.outputResponsibilityTitle': '排他 / ASIO 使用時の注意',
  'audioDrawer.note.outputResponsibilityPrimary': 'ヘッドホンやスピーカーを直挿ししている場合、通常は排他を有効にする必要はありません。排他 / ASIO で問題が出て共有モードでは正常な場合は、まず DAC、オーディオデバイス、ドライバー、接続経路を確認してください。すぐにソフトウェアの不具合と判断しないでください。手間を避けたい場合は独立した DAC の使用を推奨します。',
  'audioDrawer.note.outputResponsibilitySecondary': '独立 DAC でも問題が続く場合は、設定 - 再生 でエンジンをリセットしてください。それでも解決しない場合は、グループチャットへエラーレポートを送信してください。',
  'audioDrawer.note.currentOutput': 'ここには実際に使っている出力経路が表示されます。共有は普段使い向け、ASIO と WASAPI 排他は金色で表示されます。',
  'audioDrawer.note.engine': '出力デバイス、モード、レート、EQ、リサンプル状態をすばやく確認できます。',
  'audioDrawer.note.juceOutput': '既定のメイン出力です。FFmpeg はデコードを続け、JUCE が出力を担当し、失敗時は互換経路へ自動で戻します。',
  'audioDrawer.note.juceDecode': '既定ではオフです。リサンプル不要のローカル WAV/FLAC/MP3 で JUCE デコードを試します。MP3 は Windows Media 経由で、失敗時は FFmpeg に戻します。',
  'audioDrawer.note.dsdDop': '既定ではオフです。ローカル DSF を排他または ASIO で DoP 直出し、失敗時は FFmpeg PCM に戻します。最終確認は DAC 表示で行います。',
  'audioDrawer.note.asioNativeDsd': '既定ではオフです。ASIO + ローカル DSF + DoP 有効、かつ EQ/音量/速度/DSP なしの時だけ試し、失敗時は既存の DoP/PCM に戻します。',
  'audioDrawer.note.releaseExclusiveOnPause': '実験機能です。一時停止時に WASAPI 排他を解放し、他のアプリの音を通します。再生再開時に排他を取り直し、失敗時は一時的に共有へ戻します。',
  'audioDrawer.option.juceOutput': 'JUCE メイン出力',
  'audioDrawer.option.juceDecode': 'JUCE デコード実験',
  'audioDrawer.option.dsdDop': 'DSD DoP 直出実験',
  'audioDrawer.option.asioNativeDsd': 'ASIO ネイティブ DSD 実験',
  'audioDrawer.option.releaseExclusiveOnPause': '一時停止で排他を解放',
  'audioDrawer.option.active': 'オン',
  'audioDrawer.option.set': '設定',
  'audioDrawer.option.automix': 'Automix を有効化',
  'audioDrawer.option.automixActive': '現在の再生は Automix のプリミックス経路を使用しています。',
  'audioDrawer.option.automixDescription': '既定ではオフです。オンにすると、キュー再生中に現在の曲の終端と次の曲を自動で重ねてクロスフェードします。',
  'audioDrawer.option.rememberOutput': '出力設定を保存',
  'audioDrawer.option.rememberOutputDescription': '次回起動時に選択した出力デバイス、出力モード、バッファーなどの設定を復元します。',
  'audioDrawer.option.showAsioPanelSettings': 'ASIO パネル設定を表示する',
  'audioDrawer.option.showAsioPanelSettingsDescription': '既定ではオフです。オンにすると ASIO デバイスの下に「ASIO パネルを開く」ボタンを表示します。',
  'audioDrawer.option.directSound': 'DirectSound 互換',
  'audioDrawer.option.directSoundDescription': '手動の互換モードです。遅延が大きいため、WASAPI 再生に問題がある場合だけ試してください。',
  'audioDrawer.option.sharedBackend': '共有バックエンド',
  'audioDrawer.option.wasapiShared': 'WASAPI Shared',
  'audioDrawer.option.wasapiSharedDescription': '通常の Windows 共有出力経路です。',
  'audioDrawer.option.wasapiExclusive': 'WASAPI 排他モード',
  'audioDrawer.option.wasapiExclusiveDescription': '共有は通常の Windows 出力経路です。排他は同じデバイスを共有ミキサーなしで開きます。DAC/オーディオデバイスとドライバーが安定している場合だけ推奨します。Realtek などのオンボードドライバーは相性が弱く、無音・途切れ・切り替え失敗の原因になることがあります。',
  'audioDrawer.section.advancedOutput': '詳細出力',
  'audioDrawer.section.automix': 'Automix',
  'audioDrawer.section.asioDevices': 'ASIO 出力デバイス',
  'audioDrawer.section.currentOutput': '現在の出力',
  'audioDrawer.section.hiddenDevices': '非表示デバイス',
  'audioDrawer.section.systemDevices': 'システム出力デバイス',
  'audioDrawer.signal.balanceDsp': 'バランス DSP',
  'audioDrawer.signal.bitPerfect': 'Bit-perfect',
  'audioDrawer.signal.dspOn': 'DSP オン',
  'audioDrawer.signal.eqOff': 'EQ オフ',
  'audioDrawer.signal.eqOn': 'EQ オン',
  'audioDrawer.signal.asioSdkOutput': 'ASIO SDK 出力',
  'audioDrawer.signal.ffmpegDecode': 'FFmpeg デコード',
  'audioDrawer.signal.dsdDop': 'DSF bitstream -> DoP',
  'audioDrawer.signal.dsdDopFallback': 'DSD DoP fallback',
  'audioDrawer.signal.dsdDopStandby': 'DoP not used',
  'audioDrawer.signal.juceDecode': 'JUCE デコード',
  'audioDrawer.signal.juceDecodeFallback': 'JUCE デコード fallback',
  'audioDrawer.signal.juceDecodeStandby': 'JUCE デコード未適用',
  'audioDrawer.signal.nativeRate': 'ネイティブレート',
  'audioDrawer.signal.noActiveSource': 'アクティブなソースなし',
  'audioDrawer.signal.pending': '保留中',
  'audioDrawer.signal.processed': '処理済み',
  'audioDrawer.signal.sharedMixer': '共有ミキサー',
  'audioDrawer.signal.standardPath': '標準経路',
  'audioDrawer.status.noTrack': '曲なし',
  'audioDrawer.status.ratePending': 'レート未確定',
  'audioDrawer.status.sampleRatePending': 'サンプルレート未確定',
  'audioDrawer.title': '音声設定',
  'audioDrawer.todo.outputControls': 'ターゲットレートとバッファー制御',
  'audioDrawer.todo.outputControlsDescription': 'TODO: DeviceService が安全な制御を公開したら実際の音声設定に接続します。',
  'audioDrawer.troubleshooting.description': '音が固まったりデバイス一覧が不正な時に使います。ソフト再起動は他のアプリに影響しません。',
  'audioDrawer.troubleshooting.hardAction': 'Windows Audio サービスを再起動',
  'audioDrawer.troubleshooting.hardBusy': 'Windows Audio サービスを再起動中',
  'audioDrawer.troubleshooting.hardConfirm': 'これはすべてのアプリの音声（Chrome、ゲーム、通話）を中断し、管理者権限が必要です。続行しますか？',
  'audioDrawer.troubleshooting.hardDone': 'Windows Audio サービスが復旧しました。もう一度再生できます',
  'audioDrawer.troubleshooting.softAction': '音声エンジンを再起動',
  'audioDrawer.troubleshooting.softBusy': '音声エンジンを再起動中',
  'audioDrawer.troubleshooting.softDone': '音声エンジンを再起動しました。もう一度再生できます',
  'audioDrawer.troubleshooting.title': '音声トラブルシューティング',
  'folders.action.addScan': '追加してスキャン',
  'folders.action.browse': '参照',
  'folders.action.cancel': 'キャンセル',
  'folders.action.open': '開く',
  'folders.action.play': '再生',
  'folders.action.queue': 'キューに追加',
  'folders.action.random': 'ランダム',
  'folders.action.refresh': 'フォルダーを更新',
  'folders.action.remove': '削除',
  'folders.action.scan': 'スキャン',
  'folders.confirm.deleteTrack': 'この音楽ファイルを削除しますか？\n{title}',
  'folders.confirm.removeRoot': '「{name}」をライブラリインデックスから削除しますか？音楽ファイルはディスク上に残ります。',
  'folders.count.tracks': '{count} 曲',
  'folders.detail.importHint': '音楽フォルダーを取り込むと、パス別にライブラリを閲覧できます。',
  'folders.detail.libraryFolders': 'ライブラリフォルダー',
  'folders.detail.root': 'ルート',
  'folders.detail.selectFolder': 'フォルダーを選択',
  'folders.detail.subfolder': 'サブフォルダー',
  'folders.duration.hours': '{count} 時間',
  'folders.duration.hoursMinutes': '{hours} 時間 {minutes} 分',
  'folders.duration.minutes': '{count} 分',
  'folders.empty.noScan': 'このルートではまだスキャンが実行されていません。',
  'folders.empty.roots': 'ライブラリフォルダーはまだありません。',
  'folders.error.actionFailed': 'フォルダー操作に失敗しました。',
  'folders.error.desktopEditTags': 'デスクトップブリッジを利用できません。ECHO Next デスクトップ版で埋め込みタグを編集してください。',
  'folders.error.desktopFileActions': 'デスクトップブリッジを利用できません。ECHO Next デスクトップ版でファイル操作を使用してください。',
  'folders.error.desktopImport': 'デスクトップブリッジを利用できません。ECHO Next デスクトップ版でフォルダーを取り込んでください。',
  'folders.error.desktopManage': 'デスクトップブリッジを利用できません。ECHO Next デスクトップ版でフォルダーを管理してください。',
  'folders.error.noCoverSaved': '保存されたカバーアートはありません。',
  'folders.error.noCoverToCopy': 'この曲にはコピーできるカバーアートがありません。',
  'folders.error.notFolder': '選択したパスはフォルダーではありません。',
  'folders.error.pathMissing': 'フォルダーパスが存在しません。',
  'folders.error.permission': 'ECHO にはこのフォルダーへアクセスする権限がありません。',
  'folders.error.trackActionUnavailable': 'この曲の操作はまだ利用できません。',
  'folders.filters.includeSubfolders': 'サブフォルダーを含める',
  'folders.filters.label': 'フォルダー内の曲フィルター',
  'folders.filters.searchPlaceholder': 'このフォルダーを検索...',
  'folders.message.addedToPlaylist': 'プレイリストに追加しました: {name}',
  'folders.message.alreadyScanning': 'このライブラリルートはすでにスキャン中です。',
  'folders.message.folderAddedScanStarted': 'フォルダーを追加しました。スキャンはバックグラウンドで開始されました。',
  'folders.message.folderRemoved': 'フォルダーをライブラリインデックスから削除しました。',
  'folders.message.loadedPartial': 'メモリ使用量を抑えるため、{total} 曲中 {loaded} 曲を読み込みました。',
  'folders.message.loadedTracks': '{count} 曲を読み込みました。',
  'folders.message.noPlayableTracks': 'このフォルダーには再生可能な曲がありません。',
  'folders.message.queuedTracks': '{count} 曲をキューに追加しました。',
  'folders.message.scanCancelled': 'スキャンをキャンセルしました。',
  'folders.message.scanStarted': 'スキャンを開始しました。',
  'folders.metrics.duration': '再生時間',
  'folders.metrics.label': 'フォルダー指標',
  'folders.metrics.size': 'サイズ',
  'folders.metrics.subfolders': 'サブフォルダー',
  'folders.metrics.tracks': '曲',
  'folders.panel.addFolder': 'フォルダーを追加',
  'folders.panel.import': '取り込み',
  'folders.panel.manage': '管理',
  'folders.panel.scan': 'スキャン',
  'folders.panel.selectedRoot': '選択中のルート',
  'folders.panel.status': '状態',
  'folders.phase.checkingCache': 'キャッシュ確認',
  'folders.phase.discovering': 'ファイル検索',
  'folders.phase.extractingCovers': 'カバー抽出',
  'folders.phase.finished': '完了',
  'folders.phase.groupingAlbums': 'アルバム整理',
  'folders.phase.readingMetadata': 'タグ読み込み',
  'folders.phase.writingDatabase': 'データベース書き込み',
  'folders.prompt.choosePlaylist': 'プレイリスト番号を選択:\n{names}',
  'folders.prompt.createPlaylist': 'プレイリストがまだありません。作成する名前を入力してください:',
  'folders.queueSource.recursive': '{name} フォルダー',
  'folders.scan.progress': '{processed}/{total} ファイル、エラー {errors} 件',
  'folders.sidebar.kicker': 'ライブラリ',
  'folders.sidebar.title': 'フォルダー',
  'folders.sort.album': 'アルバム',
  'folders.sort.artist': 'アーティスト',
  'folders.sort.duration': '再生時間',
  'folders.sort.quality': '音質',
  'folders.sort.random': 'ランダム',
  'folders.sort.recent': '最近更新',
  'folders.sort.title': 'タイトル',
  'folders.status.cancelled': 'キャンセル済み',
  'folders.status.completed': '完了',
  'folders.status.failed': '失敗',
  'folders.status.queued': '待機中',
  'folders.status.running': 'スキャン中',
  'folders.statusLine.loadingTracks': 'フォルダー内の曲を読み込み中...',
  'folders.statusLine.preparingQueue': 'フォルダーキューを準備中...',
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
  'route.connect.description': 'DLNA / AirPlay ワイヤレス再生。',
  'route.connect.label': 'Connect',
  'route.downloads.description': 'ダウンロードタスクのプレースホルダー。',
  'route.downloads.label': 'ダウンロード',
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
  'route.lyrics.description': '歌詞と没入再生。',
  'route.lyrics.label': '歌詞',
  'route.lyricsSettings.description': '歌詞の設定。',
  'route.lyricsSettings.label': '歌詞設定',
  'route.mvSettings.description': 'MV の紐付けとローカル検索設定。',
  'route.mvSettings.label': 'MV 設定',
  'mvSettings.action.chooseFile': 'ファイルを選択',
  'mvSettings.action.close': 'MV 設定を閉じる',
  'mvSettings.action.collapseNetwork': 'ネットワークソースを折りたたむ',
  'mvSettings.action.dragReorder': 'ドラッグして優先度を変更',
  'mvSettings.action.dragSource': '{provider} をドラッグして優先度を変更',
  'mvSettings.action.expandNetwork': 'ネットワークソースを展開',
  'mvSettings.action.findLocal': 'ローカル検索',
  'mvSettings.action.openExternal': '選択した MV を外部で開く',
  'mvSettings.action.refresh': '更新',
  'mvSettings.action.removeSelected': '選択した MV を削除',
  'mvSettings.action.searchNetwork': 'ネットワーク MV を検索',
  'mvSettings.aria.candidates': 'MV 候補',
  'mvSettings.aria.drawer': 'MV 設定',
  'mvSettings.aria.engineStatus': 'MV エンジン状態',
  'mvSettings.aria.maxQuality': '最大画質 {quality}',
  'mvSettings.aria.maxQualityOptions': '最大画質オプション',
  'mvSettings.aria.networkSources': 'ネットワークソース優先度',
  'mvSettings.aria.selectedQuality': '選択中 MV 画質 {quality}',
  'mvSettings.aria.selectedQualityOptions': '選択中 MV 画質オプション',
  'mvSettings.badge.credentialsMain': '認証情報はメインに保持',
  'mvSettings.badge.proxyOnly': 'プロキシのみ',
  'mvSettings.binding.selectedMv': '選択中の MV',
  'mvSettings.binding.title': 'MV ソース',
  'mvSettings.candidate.external': '外部',
  'mvSettings.candidate.inApp': 'アプリ内',
  'mvSettings.custom.apply': 'カスタム MV を適用',
  'mvSettings.custom.description': 'YouTube または Bilibili の動画リンクを現在の MV として貼り付けます。',
  'mvSettings.custom.directDash': '直接ストリーム（DASH）',
  'mvSettings.custom.input': 'カスタム MV リンク',
  'mvSettings.custom.placeholder': 'https://youtube.com/watch?v=... または BVxxxxxxxx',
  'mvSettings.custom.playing': '再生中: {provider} - {sourceId}',
  'mvSettings.custom.title': 'カスタム MV',
  'mvSettings.custom.videoTitle': '動画タイトル: {title}',
  'mvSettings.engine.mvTitle': 'MVタイトル',
  'mvSettings.engine.network': 'ネットワーク',
  'mvSettings.engine.quality': '画質',
  'mvSettings.engine.selected': '選択中',
  'mvSettings.engine.title': 'MV エンジン',
  'mvSettings.error.noActiveTrackBinding': 'MV の紐付けに使えるライブラリ曲が選択されていません',
  'mvSettings.error.noActiveTrackMatching': 'MV 検索に使えるライブラリ曲が選択されていません',
  'mvSettings.error.noActiveTrackNetworkSearch': 'ネットワーク MV 検索に使えるライブラリ曲が選択されていません',
  'mvSettings.error.noLocalCandidates': 'ローカル MV 候補が見つかりません',
  'mvSettings.error.noNetworkCandidates': 'ネットワーク MV 候補が見つかりません',
  'mvSettings.general.enabled': 'MV を有効化',
  'mvSettings.immersive.blur': '背景ぼかし',
  'mvSettings.immersive.brightness': '背景の明るさ',
  'mvSettings.immersive.description': 'オンにすると、歌詞ページで現在の MV を背景として使います。',
  'mvSettings.immersive.dragHint': '歌詞ページの空き領域をドラッグして調整できます。',
  'mvSettings.immersive.lyricsReadability': '歌詞の読みやすさを強化',
  'mvSettings.immersive.lyricsReadabilityDescription': '没入型 MV 上の歌詞にアウトラインと影を追加します。',
  'mvSettings.immersive.overlay': '暗色オーバーレイ',
  'mvSettings.immersive.overlayHint': '低いほど原画に近く、高いほど歌詞が読みやすくなります。',
  'mvSettings.immersive.positionX': '横位置',
  'mvSettings.immersive.positionY': '縦位置',
  'mvSettings.immersive.reset': '没入型背景をリセット',
  'mvSettings.immersive.title': '没入型 MV 背景',
  'mvSettings.immersive.visualHint': '没入型背景の見え方を調整します。',
  'mvSettings.immersive.zoom': '背景ズーム',
  'mvSettings.network.autoApply': 'ネットワーク MV を自動検索',
  'mvSettings.network.autoApplyThreshold': '自動適用の一致度',
  'mvSettings.network.autoApplyThresholdDescription': '候補が {threshold} 以上の場合だけ自動適用します。',
  'mvSettings.network.autoPreload': 'MV をプリロード',
  'mvSettings.network.autoPreloadDescription': 'オンにすると、曲の再生時に現在の曲の MV を事前に検索して準備します。',
  'mvSettings.network.maxQuality': '最大画質',
  'mvSettings.network.replayAudioOnChange': 'MV 切り替え後に音楽を自動再生',
  'mvSettings.network.replayAudioOnChangeDescription': 'オンにすると、MV を手動で選択または紐付けた後、現在の曲を再生し直して新しい MV をすぐ反映します。',
  'mvSettings.network.restartAudioOnLoad': 'MV を音楽の進行に追従',
  'mvSettings.network.restartAudioOnLoadDescription': 'オンにすると MV の映像時間だけを補正し、音声のシークや再起動は行いません。歌詞同期オフセットの影響も受けません。',
  'mvSettings.network.title': 'ネットワークソース',
  'mvSettings.offset.aria': 'MV 同期遅延',
  'mvSettings.offset.description': '現在の曲の MV だけに保存され、別の曲には影響しません。',
  'mvSettings.offset.earlier': 'MV を {value} 早める',
  'mvSettings.offset.later': 'MV を {value} 遅らせる',
  'mvSettings.offset.reset': 'MV 遅延をリセット',
  'mvSettings.offset.title': 'この曲の MV 遅延',
  'mvSettings.provider.local': 'ローカル',
  'mvSettings.quality.max': '最大',
  'mvSettings.search.input': 'MV 検索キーワード',
  'mvSettings.search.placeholder': 'MV 検索キーワードを入力',
  'mvSettings.search.useCurrentSong': '現在の曲名とアーティストで検索',
  'mvSettings.status.auto': '自動',
  'mvSettings.status.noActiveTrack': '再生中の曲なし',
  'mvSettings.status.none': 'なし',
  'mvSettings.status.off': 'オフ',
  'mvSettings.status.on': 'オン',
  'mvSettings.title': 'MV 設定',
  'trackMenu.action.addToPlaylist': 'プレイリストに追加...',
  'trackMenu.action.playNext': '次に再生',
  'trackMenu.action.addToQueue': 'キューに追加',
  'trackMenu.action.like': 'お気に入り',
  'trackMenu.action.unlike': 'お気に入りを解除',
  'trackMenu.action.removeFromQueue': '再生キューから削除',
  'trackMenu.action.openOsuTiming': 'osu! Timing',
  'trackMenu.action.editTags': 'タグを編集',
  'trackMenu.action.reloadEmbeddedTags': '埋め込みタグを再読み込み',
  'trackMenu.action.goToAlbum': 'アルバムへ移動',
  'trackMenu.action.showInFolder': 'フォルダで表示',
  'trackMenu.action.copyPath': 'ファイルパスをコピー',
  'trackMenu.action.openSystem': 'システム既定のアプリで開く',
  'trackMenu.action.copyNameArtist': '曲名とアーティストをコピー',
  'trackMenu.action.copyCover': '曲カード画像をコピー',
  'trackMenu.action.saveCover': '曲カード画像を保存',
  'trackMenu.action.deleteSong': '曲を削除',
  'route.playlists.description': 'ユーザープレイリスト。',
  'route.playlists.label': 'プレイリスト',
  'route.queue.description': '再生キュー。',
  'route.queue.label': 'キュー',
  'queue.action.clear': 'キューを空にする',
  'queue.action.dragLabel': '{title} をドラッグ',
  'queue.action.dragTitle': 'ドラッグして並べ替え',
  'queue.action.generateFromHistory': '履歴からキューを作成',
  'queue.action.generateRandom': 'ランダムキューを作成',
  'queue.action.generatingHistory': '作成中',
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
  'queue.error.noHistoryTracks': 'キュー作成に使える再生履歴がまだありません。',
  'queue.error.noRandomTracks': 'ランダムキューに追加できる曲がライブラリにありません。',
  'queue.header.kicker': '再生キュー',
  'queue.header.title': 'キュー',
  'queue.historySource': 'よく聴く履歴',
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
  'settings.eq.action.autoPreamp': '自動 {value}',
  'settings.eq.action.bypass': 'バイパス',
  'settings.eq.action.delete': '削除',
  'settings.eq.action.holdBypass': '押している間 EQ をバイパス',
  'settings.eq.action.resetBand': '{frequency} をリセット',
  'settings.eq.action.resetChannelBalance': 'チャンネルバランスをリセット',
  'settings.eq.action.resetEq': 'EQ をリセット',
  'settings.eq.action.save': '保存',
  'settings.eq.band.fallback': 'バンド',
  'settings.eq.band.readoutsAria': '10 バンド EQ のドラッグ可能なバンド表示',
  'settings.eq.bitPerfect.channelDisabled': 'DSP 有効: bit-perfect は無効です。',
  'settings.eq.bitPerfect.disabled': 'DSP 有効: bit-perfect は無効です{reason}。',
  'settings.eq.bitPerfect.readyPath': 'bit-perfect 経路を維持できます。',
  'settings.eq.channel.active': '有効',
  'settings.eq.channel.balance': 'バランス',
  'settings.eq.channel.bypassed': 'バイパス',
  'settings.eq.channel.center': '中央',
  'settings.eq.channel.constantPower': '定電力',
  'settings.eq.channel.description': 'Balance は左右の定位補正、L/R Gain は細かな補正、Mono Sum はモノ確認、Invert は位相確認に使います。',
  'settings.eq.channel.dsp': 'DSP',
  'settings.eq.channel.invertLeft': '左を反転',
  'settings.eq.channel.invertRight': '右を反転',
  'settings.eq.channel.leftGain': '左ゲイン',
  'settings.eq.channel.leftTotal': '左合計',
  'settings.eq.channel.mono.left': '左',
  'settings.eq.channel.mono.off': 'オフ',
  'settings.eq.channel.mono.right': '右',
  'settings.eq.channel.mono.sum': '合成',
  'settings.eq.channel.monoMode': 'モノモード',
  'settings.eq.channel.rightGain': '右ゲイン',
  'settings.eq.channel.rightTotal': '右合計',
  'settings.eq.channel.swap': 'L/R 交換',
  'settings.eq.channel.title': 'チャンネルバランス',
  'settings.eq.curve.aria': 'ドラッグ可能な 10 バンド EQ 周波数特性',
  'settings.eq.curve.dragBand': '{frequency} EQ バンドをドラッグ',
  'settings.eq.error.bridgeChannelBalance': 'デスクトップブリッジを利用できません。ECHO Next デスクトップ版でチャンネルバランスを操作してください。',
  'settings.eq.error.bridgeControlEq': 'デスクトップブリッジを利用できません。ECHO Next デスクトップ版で EQ を操作してください。',
  'settings.eq.error.bridgeDeletePreset': 'デスクトップブリッジを利用できません。ECHO Next デスクトップ版で EQ プリセットを削除してください。',
  'settings.eq.error.bridgeSavePreset': 'デスクトップブリッジを利用できません。ECHO Next デスクトップ版で EQ プリセットを保存してください。',
  'settings.eq.error.presetName': 'プリセット名を入力してください。',
  'settings.eq.action.hideAdvanced': '詳細を隠す',
  'settings.eq.action.showAdvanced': '詳細',
  'settings.eq.ab.summary': '{preset} / peak {peak} / out {output} / preamp {preamp}',
  'settings.eq.level.clips': 'クリップ {count}',
  'settings.eq.level.estimatedOutputPeak': '推定出力ピーク',
  'settings.eq.level.headroom': 'ヘッドルーム',
  'settings.eq.level.inputPeak': '入力ピーク',
  'settings.eq.level.inputRms': '入力 RMS',
  'settings.eq.level.sourceEstimate': 'pre-native + DSP 推定',
  'settings.eq.preamp.aria': 'EQ プリアンプ',
  'settings.eq.preamp.safeHeadroom': '安全ヘッドルーム',
  'settings.eq.preset.nameAria': 'プリセット名',
  'settings.eq.preset.readonly': '内蔵プリセットは読み取り専用です。',
  'settings.eq.preset.savePlaceholder': 'ユーザープリセットとして保存',
  'settings.eq.state.eqDisabled': 'EQ 無効',
  'settings.eq.state.eqEnabled': 'EQ 有効',
  'settings.eq.status.bitPerfect': 'Bit-perfect',
  'settings.eq.status.clippingRisk': 'クリップ危険',
  'settings.eq.status.eq': 'EQ',
  'settings.eq.status.headroom': 'ヘッドルーム',
  'settings.eq.status.preamp': 'プリアンプ',
  'settings.eq.status.preset': 'プリセット',
  'settings.eq.status.safe': '安全',
  'settings.eq.status.safeHeadroomShort': '安全ヘッドルーム',
  'settings.eq.status.warning': '警告',
  'settings.eq.subtitle': 'HiFi DSP パネル',
  'settings.eq.title': '10 バンド グラフィック EQ',
  'settings.eq.warning.channelClipping': 'クリップの危険があります。ゲインまたはプリアンプを下げると安全です。',
  'settings.eq.warning.lowerPreamp': 'クリップを避けるにはプリアンプを下げてください。',
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
  'settings.playback.sharedBackend.description': 'DirectSound は手動の互換モードです。遅延が大きいため、普段は WASAPI Shared を使います。',
  'settings.playback.sharedBackend.directSound': 'DirectSound 互換',
  'settings.playback.sharedBackend.title': '共有バックエンド',
  'settings.playback.sharedBackend.wasapi': 'WASAPI Shared',
  'settings.playback.outputDevice.title': '出力デバイス',
  'settings.playback.outputDevice.description': 'echo-audio-host から取得したデバイス一覧です。デバイスがない場合は既定出力を維持します。',
  'settings.playback.outputDevice.empty': '利用可能なデバイスなし',
  'settings.playback.resetEngine.action': '音声エンジンを再起動',
  'settings.playback.resetEngine.busy': '再起動中',
  'settings.playback.resetEngine.description': '現在の再生を停止して native 音声ホストを解放します。デバイスやドライバーが固まった時に、アプリ再起動の前に試せます。',
  'settings.playback.resetEngine.done': '音声エンジンを再起動しました。もう一度再生できます',
  'settings.playback.resetEngine.title': '音声エンジンを再起動',
  'settings.playback.troubleshooting.description': '音が固まったりデバイス一覧が不正な時に使います。ソフト再起動は他のアプリに影響しません。',
  'settings.playback.troubleshooting.hardAction': 'Windows Audio サービスを再起動',
  'settings.playback.troubleshooting.hardBusy': 'Windows Audio サービスを再起動中',
  'settings.playback.troubleshooting.hardConfirm': 'これはすべてのアプリの音声（Chrome、ゲーム、通話）を中断し、管理者権限が必要です。続行しますか？',
  'settings.playback.troubleshooting.hardDone': 'Windows Audio サービスが復旧しました。もう一度再生できます',
  'settings.playback.troubleshooting.softAction': '音声エンジンを再起動',
  'settings.playback.troubleshooting.softBusy': '音声エンジンを再起動中',
  'settings.playback.troubleshooting.softDone': '音声エンジンを再起動しました。もう一度再生できます',
  'settings.playback.troubleshooting.title': '音声トラブルシューティング',
  'settings.playback.wireless.title': 'ワイヤレス再生',
  'settings.playback.wireless.description': '今後の HiFi エンジン段階で接続します。現段階では gapless / automix / ストリーミングは移行しません。',
  'settings.playback.followCurrent.title': '再生中の曲へ移動',
  'settings.playback.followCurrent.description': '有効にすると、曲変更時に左側の現在リストを再生中の曲へ自動スクロールします。',
  'settings.playback.audioStatus.title': '音声状態',
  'settings.playback.audioStatus.description': 'サンプルレート欄を分けて表示し、旧 ECHO の排他モード 48k 固定の再発を避けます。',
  'settings.playback.automix.description': '既定ではオフです。有効にすると、連続キューで次の曲を先に準備し、ネイティブのデュアル Deck エンジンで終端の無音を避けながら自然につなぎます。',
  'settings.playback.automix.title': 'Automix スマート遷移',
  'settings.playback.stability.action.copied': 'コピーしました',
  'settings.playback.stability.action.copy': '診断情報をコピー',
  'settings.playback.stability.action.refresh': '再生安定性診断を更新',
  'settings.playback.stability.error.desktopBridgeUnavailable': 'デスクトップブリッジを利用できません。',
  'settings.playback.stability.field.lastSharedStabilityRecoveryAt': '前回の Shared 安定化復旧時刻',
  'settings.playback.stability.field.lastWatchdogRecoveryTime': '前回の watchdog 復旧時刻',
  'settings.playback.stability.field.nativeBufferedFrames': 'Native バッファーフレーム',
  'settings.playback.stability.field.nativeBufferedMs': 'Native バッファー ms',
  'settings.playback.stability.field.nativeDeviceBufferFrames': 'デバイスバッファーフレーム',
  'settings.playback.stability.field.nativeFifoCapacityFrames': 'Native FIFO 容量フレーム',
  'settings.playback.stability.field.nativeStartupPrebufferFrames': '起動プリバッファーフレーム',
  'settings.playback.stability.field.nativeUnderrunCallbacks': 'Native underrun コールバック',
  'settings.playback.stability.field.nativeUnderrunFrames': 'Native underrun フレーム',
  'settings.playback.stability.field.recentWatchdogRecoveryCount': '最近の watchdog 復旧回数',
  'settings.playback.stability.field.sharedStabilityTier': 'Shared 安定性ティア',
  'settings.playback.stability.field.watchdogStatus': 'watchdog 状態',
  'settings.playback.stability.title': '再生安定性診断',
  'settings.playback.stability.value.unknown': '不明',
  'settings.integrations.discord.action.refresh': '状態を更新',
  'settings.integrations.discord.title': 'Discord ステータス',
  'settings.integrations.discord.description': '現在の再生状態を Discord Rich Presence に同期し、曲名、アーティスト、進行状況、再生状態を表示します。',
  'settings.integrations.smtc.description': '現在の再生情報、アートワーク、進行状況、メディアキー操作を Windows の音量フライアウトとロック画面へ公開します。',
  'settings.integrations.smtc.title': 'Windows メディア コントロール',
  'settings.integrations.lastfm.action.completeAuth': '認証を完了',
  'settings.integrations.lastfm.action.connect': 'Last.fm に接続',
  'settings.integrations.lastfm.action.disconnect': '切断',
  'settings.integrations.lastfm.action.refresh': '状態を更新',
  'settings.integrations.lastfm.activeProgress': '{artist} - {title} · {played}/{threshold} 秒',
  'settings.integrations.lastfm.activeTrack': '現在の曲',
  'settings.integrations.lastfm.connection.description': 'ブラウザー認証を推奨します。Last.fm で Allow を押した後、ECHO Next に戻って認証を完了してください。',
  'settings.integrations.lastfm.connection.title': 'Last.fm 接続',
  'settings.integrations.lastfm.description': 'メインプロセスでローカル再生を記録し、ファイルパス、歌詞、アートワークは送信しません。',
  'settings.integrations.lastfm.lastNowPlaying': '前回の Now Playing',
  'settings.integrations.lastfm.lastScrobble': '前回の Scrobble',
  'settings.integrations.lastfm.never': '未送信',
  'settings.integrations.lastfm.noActiveTrack': 'アクティブな曲なし',
  'settings.integrations.lastfm.nowPlaying.description': '再生開始時に現在の曲情報を一度送信します。',
  'settings.integrations.lastfm.nowPlaying.title': 'Last.fm Now Playing',
  'settings.integrations.lastfm.scrobbling.description': '曲が Last.fm の記録しきい値に達したら再生記録を送信します。',
  'settings.integrations.lastfm.scrobbling.title': 'Last.fm Scrobbling',
  'settings.integrations.lastfm.status.connected': '接続済み {username}',
  'settings.integrations.lastfm.status.error': 'エラー: {error}',
  'settings.integrations.lastfm.status.notConnected': '未接続',
  'settings.integrations.lastfm.status.pending': '認証完了待ち',
  'settings.integrations.lastfm.statusLabel': '状態',
  'settings.integrations.lastfm.title': 'Last.fm',
  'settings.integrations.mobile.title': 'スマホリモコン',
  'settings.integrations.mobile.description': '将来の外部デバイス機能は制御された IPC を通し、Renderer がシステムリソースへ直接接続しないようにします。',
  'settings.remote.library.title': 'リモート音楽ライブラリ',
  'settings.remote.library.description': 'この段階ではクラウド / リモート / ストリーミングを禁止し、設定グループの場所だけ残します。',
  'settings.appearance.theme.title': 'テーマ',
  'settings.appearance.theme.description': 'ライト、ダーク、またはシステム設定に合わせます。',
  'settings.appearance.theme.light': 'ライト',
  'settings.appearance.theme.dark': 'ダーク',
  'settings.appearance.theme.followSystem': 'システムに合わせる',
  'settings.appearance.themePreset.title': 'テーマプリセット',
  'settings.appearance.themePreset.description': 'アプリ全体のグラデーション色板を選びます。ライト/ダーク設定はそのまま使われます。',
  'settings.appearance.themePreset.classic': 'Classic ECHO Next',
  'settings.appearance.themePreset.classic.description': '現在のすっきりしたブルーグレーの質感を保ちます。',
  'settings.appearance.themePreset.echoTwilight': 'Twilight Peach Mist',
  'settings.appearance.themePreset.echoTwilight.description': '旧 ECHO らしい暖かいピンクのグラデーション。',
  'settings.appearance.themePreset.sakuraMilk': 'Sakura Milk',
  'settings.appearance.themePreset.sakuraMilk.description': 'ミルキーなピンクにチェリーレッドのアクセント。',
  'settings.appearance.themePreset.peachSoda': 'Peach Soda',
  'settings.appearance.themePreset.peachSoda.description': 'ピーチオレンジとソーダミントの軽い組み合わせ。',
  'settings.appearance.themePreset.mintCandy': 'Mint Candy',
  'settings.appearance.themePreset.mintCandy.description': 'ミント、クリーム、少しのピーチピンク。',
  'settings.appearance.themePreset.berryDream': 'Berry Dream',
  'settings.appearance.themePreset.berryDream.description': 'ベリーパープルと雲の白、夢っぽいピンクの光。',
  'settings.appearance.themePreset.matchaCream': 'Matcha Cream',
  'settings.appearance.themePreset.matchaCream.description': '抹茶グリーンとクリームイエローの落ち着いた配色。',
  'settings.appearance.themePreset.lemonMochi': 'Lemon Mochi',
  'settings.appearance.themePreset.lemonMochi.description': 'Milky lemon yellow with a soft sky-blue lift.',
  'settings.appearance.themePreset.cottonCloud': 'Cotton Cloud',
  'settings.appearance.themePreset.cottonCloud.description': 'Cloud white, gentle blue, and a soft pink accent.',
  'settings.appearance.themePreset.melonCream': 'Melon Cream',
  'settings.appearance.themePreset.melonCream.description': 'Melon green over cream, cute and readable.',
  'settings.appearance.themePreset.seaSaltJelly': 'Sea Salt Jelly',
  'settings.appearance.themePreset.seaSaltJelly.description': 'Sea-salt cyan with a peachy jelly glow.',
  'settings.appearance.themePreset.caramelPudding': 'Caramel Pudding',
  'settings.appearance.themePreset.caramelPudding.description': 'Creamy caramel with a strawberry glow, sweet but readable.',
  'settings.appearance.themePreset.neonCandy': 'Neon Candy',
  'settings.appearance.themePreset.neonCandy.description': 'Violet neon, pink highlights, and mint bubbles.',
  'settings.appearance.themePreset.nyanCat': 'Nyan Cat',
  'settings.appearance.themePreset.nyanCat.description': 'ゆっくり流れるかわいい虹色グラデーション。進捗バーには虹色の猫が走ります。',
  'settings.appearance.themePreset.wisteriaBubble': 'Wisteria Bubble',
  'settings.appearance.themePreset.wisteriaBubble.description': 'Wisteria mist with mint bubbles, dreamy but fresh.',
  'settings.appearance.themePreset.strawberryCookie': 'Strawberry Cookie',
  'settings.appearance.themePreset.strawberryCookie.description': 'Cream-cookie warmth with strawberry red and baked gold.',
  'settings.appearance.themePreset.graphiteAurora': 'Graphite Aurora',
  'settings.appearance.themePreset.graphiteAurora.description': 'Graphite gray with a quiet green aurora edge.',
  'settings.appearance.themePreset.amberNoir': 'Amber Noir',
  'settings.appearance.themePreset.amberNoir.description': 'Black-gold listening room tones for long dark sessions.',
  'settings.appearance.themePreset.oceanStudio': 'Ocean Studio',
  'settings.appearance.themePreset.oceanStudio.description': 'Cool blue-gray and sea mist for a clean studio feel.',
  'settings.appearance.themePreset.rosewoodVinyl': 'Rosewood Vinyl',
  'settings.appearance.themePreset.rosewoodVinyl.description': 'Warm rosewood reds with a grounded vinyl mood.',
  'settings.appearance.themePreset.darkSideMoon': 'The Dark Side of the Moon',
  'settings.appearance.themePreset.darkSideMoon.description': 'Pink Floyd へのトリビュート。黒い月面、白いプリズム、虹色のスペクトル。',
  'settings.appearance.themePreset.shibuyaNight': '渋谷ナイト',
  'settings.appearance.themePreset.shibuyaNight.description': '東京ネオン、夜紫の交差点、シアンの看板光。',
  'settings.appearance.themePreset.kyotoKurenai': '京都くれない',
  'settings.appearance.themePreset.kyotoKurenai.description': '鳥居の朱、和紙の温かさ、お守りの金色。',
  'settings.appearance.themePreset.ukiyoIndigo': '浮世インディゴ',
  'settings.appearance.themePreset.ukiyoIndigo.description': '浮世絵の波を思わせる藍、紙色、古金。',
  'settings.appearance.themePreset.fujiSnow': '富士初雪',
  'settings.appearance.themePreset.fujiSnow.description': '雪白、富士ブルー、淡い桜のハイライト。',
  'settings.appearance.themePreset.matsuriLantern': '祭り提灯',
  'settings.appearance.themePreset.matsuriLantern.description': '夏祭りの提灯赤、夜店の金、温かな紙色。',
  'settings.appearance.themePreset.ginzaNoir': '銀座ノワール',
  'settings.appearance.themePreset.ginzaNoir.description': '黒曜石、シャンパンゴールド、ショーウィンドウの青。',
  'settings.appearance.themePreset.frostJazz': 'フロストジャズ',
  'settings.appearance.themePreset.frostJazz.description': '冷たいブルージャズに梅紫のステージライト。',
  'settings.appearance.themeCustom.title': 'Customize Current Theme',
  'settings.appearance.themeCustom.description': 'Choose a theme first, then tune colors. Each theme keeps its own custom colors.',
  'settings.appearance.themeCustom.action.autoFix': 'Auto-fix Text',
  'settings.appearance.themeCustom.action.export': 'Export Parameters',
  'settings.appearance.themeCustom.action.import': 'Import Parameters',
  'settings.appearance.themeCustom.action.reset': 'Reset Custom Colors',
  'settings.appearance.themeCustom.action.save': 'Save Custom Colors',
  'settings.appearance.themeCustom.advanced.show': 'Show Advanced Colors',
  'settings.appearance.themeCustom.advanced.hide': 'Hide Advanced Colors',
  'settings.appearance.themeCustom.field.appBg': 'Base',
  'settings.appearance.themeCustom.field.appBg2': 'Gradient Mid',
  'settings.appearance.themeCustom.field.appBg3': 'Gradient End',
  'settings.appearance.themeCustom.field.panel': 'Glass Tint',
  'settings.appearance.themeCustom.field.panelSoft': 'Soft Panel',
  'settings.appearance.themeCustom.field.accent': 'Primary Accent',
  'settings.appearance.themeCustom.field.accentStrong': 'Secondary Accent',
  'settings.appearance.themeCustom.field.secondary': 'Third Accent',
  'settings.appearance.themeCustom.field.heading': 'Main Text',
  'settings.appearance.themeCustom.field.text': 'Body Text',
  'settings.appearance.themeCustom.field.muted': 'Secondary Text',
  'settings.appearance.themeCustom.field.border': 'Border',
  'settings.appearance.themeCustom.field.onAccent': 'Accent Button Text',
  'settings.appearance.themeCustom.field.buttonText': 'Button Text',
  'settings.appearance.themeCustom.field.panelOpacity': 'Panel Opacity',
  'settings.appearance.themeCustom.field.glass': 'Glass',
  'settings.appearance.themeCustom.field.shadow': 'Shadow',
  'settings.appearance.themeCustom.field.appBg.description': 'Main window base color',
  'settings.appearance.themeCustom.field.appBg2.description': 'Soft middle stop of the background gradient',
  'settings.appearance.themeCustom.field.appBg3.description': 'End stop of the background gradient',
  'settings.appearance.themeCustom.field.panel.description': 'Frosted panel tint',
  'settings.appearance.themeCustom.field.panelSoft.description': 'Sidebar and softer panels',
  'settings.appearance.themeCustom.field.accent.description': 'Main interactions',
  'settings.appearance.themeCustom.field.accentStrong.description': 'Gradient and depth',
  'settings.appearance.themeCustom.field.secondary.description': 'Highlight accents',
  'settings.appearance.themeCustom.field.heading.description': 'Titles and primary copy',
  'settings.appearance.themeCustom.field.text.description': 'Body text, artists, and settings copy',
  'settings.appearance.themeCustom.field.muted.description': 'Supporting copy',
  'settings.appearance.themeCustom.field.border.description': 'Card borders and dividers',
  'settings.appearance.themeCustom.field.onAccent.description': 'Text on accent buttons',
  'settings.appearance.themeCustom.field.buttonText.description': 'Regular buttons and chips',
  'settings.appearance.themeCustom.field.panelOpacity.description': 'How much background shows through panels',
  'settings.appearance.themeCustom.field.glass.description': 'Blur and glass layering',
  'settings.appearance.themeCustom.field.shadow.description': 'Cards, popups, and player shadows',
  'settings.appearance.themeCustom.preview.title': 'Editing',
  'settings.appearance.themeCustom.preview.description': 'Changes preview live and are saved only when you click save.',
  'settings.appearance.themeCustom.group.core': 'Common Colors',
  'settings.appearance.themeCustom.group.core.description': 'Old-ECHO-style palette controls for the most visible colors.',
  'settings.appearance.themeCustom.group.gradient': 'Background Gradient',
  'settings.appearance.themeCustom.group.gradient.description': 'Controls the old-ECHO-style window gradient mood.',
  'settings.appearance.themeCustom.group.advanced': 'Advanced Details',
  'settings.appearance.themeCustom.group.advanced.description': 'Fine tune text, borders, and button text colors.',
  'settings.appearance.themeCustom.message.exported': 'Theme parameters were exported.',
  'settings.appearance.themeCustom.message.imported': 'Theme parameters were imported and applied.',
  'settings.appearance.themeCustom.message.importFailed': 'Import failed. Choose an ECHO theme parameter JSON file.',
  'settings.appearance.themeCustom.message.fixed': 'Text and button colors were adjusted.',
  'settings.appearance.themeCustom.message.invalidColor': 'Use a safe #RRGGBB color.',
  'settings.appearance.themeCustom.message.lowContrast': 'Text contrast is too low. Auto-fix it or darken text before saving.',
  'settings.appearance.themeCustom.message.reset': 'Custom colors for this theme were reset.',
  'settings.appearance.themeCustom.message.saved': 'Custom colors for this theme were saved.',
  'settings.appearance.density.title': '表示密度',
  'settings.appearance.density.description': 'ライブラリ一覧はよりコンパクトなデスクトップ密度を使い、大きすぎるカード行は使いません。',
  'settings.appearance.density.compact': 'コンパクト',
  'settings.appearance.density.standard': '標準',
  'settings.appearance.artistAvatars.action.clear': 'アバターキャッシュを消去',
  'settings.appearance.artistAvatars.action.queueing': 'キューに追加中...',
  'settings.appearance.artistAvatars.action.refreshMissing': '不足アバターを更新',
  'settings.appearance.artistAvatars.description': '本物のアーティストアバターをバックグラウンドでゆっくり取得し、アーティストウォールでローカルキャッシュ画像を再利用します。',
  'settings.appearance.artistAvatars.fallback': '見つからない場合はアーティストのアルバムアートを使用',
  'settings.appearance.artistAvatars.message.cleared': '{removedRows} 件のアバター記録と {deletedFiles} 個のファイルを消去しました。',
  'settings.appearance.artistAvatars.message.desktopBridgeClear': 'デスクトップブリッジを利用できません。アーティストアバターを消去するには Electron で ECHO Next を開いてください。',
  'settings.appearance.artistAvatars.message.desktopBridgeRefresh': 'デスクトップブリッジを利用できません。アーティストアバターを更新するには Electron で ECHO Next を開いてください。',
  'settings.appearance.artistAvatars.message.enableFirst': '先にアーティストアバターの自動取得を有効にしてください。',
  'settings.appearance.artistAvatars.message.queued': '{queued} 件のアーティストアバターをキューに追加しました。{skipped} 件をスキップしました。',
  'settings.appearance.artistAvatars.title': 'アーティストアバター',
  'settings.appearance.artistAvatars.toggle': 'アーティストアバターを自動取得',
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
  'library.action.refresh': 'Refresh',
  'library.albums.card.tracks': '{count} tracks',
  'library.albums.error.desktopBridge': 'Desktop bridge unavailable. Open ECHO Next in Electron to read albums.',
  'library.albums.listAria': 'Album list',
  'library.albums.loading': 'Loading albums...',
  'library.albums.searchPlaceholder': 'Search albums / artists',
  'library.albums.sort.aria': 'Album sort',
  'library.albums.sort.artist': 'Artist',
  'library.albums.sort.titleAsc': 'Title A-Z',
  'library.albums.sort.titleDesc': 'Title Z-A',
  'library.albums.title': 'Albums',
  'library.artists.error.desktopBridge': 'Desktop bridge unavailable. Open ECHO Next in Electron to read artists.',
  'library.artists.avatarPriority': 'Avatar First',
  'library.artists.listAria': 'Artist list',
  'library.artists.loading': 'Loading artists...',
  'library.artists.meta.albums': '{count} albums',
  'library.artists.meta.noTracks': 'No tracks',
  'library.artists.meta.tracks': '{count} tracks',
  'library.artists.searchPlaceholder': 'Search artists',
  'library.artists.sort.aria': 'Artist sort',
  'library.artists.sort.frequent': 'Most Tracks',
  'library.artists.sort.nameAsc': 'Name A-Z',
  'library.artists.sort.nameDesc': 'Name Z-A',
  'library.artists.title': 'Artists',
  'library.count.total': '{count} total',
  'library.sort.createdAsc': 'Created Oldest',
  'library.sort.createdDesc': 'Created Newest',
  'library.sort.default': 'Default',
  'library.sort.durationAsc': 'Duration Shortest',
  'library.sort.durationDesc': 'Duration Longest',
  'library.sort.fileModifiedAsc': 'File Modified Oldest',
  'library.sort.fileModifiedDesc': 'File Modified Newest',
  'library.sort.random': 'Random',
  'library.sort.recent': 'Recent',
  'library.source.aria': 'Library source',
  'library.source.local': 'Local',
  'library.source.remote': 'Cloud',
  'app.navigation.main': 'Main navigation',
  'app.navigation.utility': 'Utility navigation',
  'app.toolbar.quickActions': 'Quick actions',
  'app.toolbar.windowControls': 'Window controls',
  'app.window.minimize': 'Minimize',
  'app.window.maximize': 'Maximize',
  'app.window.close': 'Close',
  'audioDrawer.action.close': 'Close audio settings',
  'audioDrawer.action.copiedDiagnostics': 'Playback diagnostics copied',
  'audioDrawer.action.copyDiagnostics': 'Copy Playback Diagnostics',
  'audioDrawer.action.hideDevice': 'Hide device',
  'audioDrawer.action.openAsioPanel': 'Open ASIO Panel',
  'audioDrawer.action.resetEngine': 'Reset Audio Engine',
  'audioDrawer.action.resetEngineBusy': 'Resetting Audio Engine',
  'audioDrawer.action.resetEngineDone': 'Audio engine reset',
  'audioDrawer.action.restore': 'Restore',
  'audioDrawer.asioLatency.description': 'Estimated extra wait before the output plays from the buffer that actually opened. Lower feels faster; higher is safer against crackles.',
  'audioDrawer.asioLatency.recommended': 'Recommended latency',
  'audioDrawer.asioLatency.status': 'Requested {requested} frames / opened {opened} frames',
  'audioDrawer.asioLatency.value': '{value} ms',
  'audioDrawer.asioRoutes.title': 'ASIO output channels',
  'audioDrawer.badge.bitPerfectReady': 'Bit-perfect ready',
  'audioDrawer.badge.dspActive': 'DSP active',
  'audioDrawer.badge.juceFallback': 'JUCE fallback',
  'audioDrawer.badge.juceOutput': 'JUCE output',
  'audioDrawer.badge.resampling': 'Resampling',
  'audioDrawer.badge.soxrResampler': 'SOXR',
  'audioDrawer.badge.speedUp': 'Speed Up',
  'audioDrawer.buffer.asio': 'ASIO buffer',
  'audioDrawer.buffer.auto': 'Auto',
  'audioDrawer.buffer.collapsedDescription': 'Collapsed by default; open to adjust latency profile and ASIO buffer options.',
  'audioDrawer.buffer.default': 'Default',
  'audioDrawer.buffer.latencyProfile': 'Latency profile',
  'audioDrawer.buffer.low': 'Low',
  'audioDrawer.buffer.profileDefault': 'Profile default',
  'audioDrawer.buffer.safer': 'Safer',
  'audioDrawer.buffer.stable': 'Stable',
  'audioDrawer.buffer.title': 'Buffer Settings',
  'audioDrawer.buffer.ultraLow': 'Ultra low',
  'audioDrawer.device.asioDriver': 'ASIO driver',
  'audioDrawer.device.lowLatency': 'Low latency',
  'audioDrawer.device.selected': 'Selected',
  'audioDrawer.device.systemAudio': 'System audio',
  'audioDrawer.device.systemDefault': 'System default',
  'audioDrawer.device.systemDefaultOutput': 'System default output',
  'audioDrawer.device.systemOutput': 'System output',
  'audioDrawer.device.systemSelectedRoute': 'System selected route',
  'audioDrawer.empty.asioDevices': 'No ASIO output devices found.',
  'audioDrawer.empty.hiddenDevices': 'No hidden devices.',
  'audioDrawer.empty.systemDevices': 'No system output devices found.',
  'audioDrawer.error.desktopBridgeUnavailable': 'Desktop bridge unavailable',
  'audioDrawer.meter.direct': 'Direct',
  'audioDrawer.meter.chain': 'Chain',
  'audioDrawer.meter.mode': 'Mode',
  'audioDrawer.meter.output': 'Output',
  'audioDrawer.meter.rate': 'Rate',
  'audioDrawer.meter.resample': 'Resample',
  'audioDrawer.meter.source': 'Source',
  'audioDrawer.meter.latency': 'Latency',
  'audioDrawer.guard.asioUnavailable.description': 'Default off. Skips the same ASIO device briefly after No device found, then uses safe shared output.',
  'audioDrawer.guard.asioUnavailable.title': 'ASIO unavailable guard',
  'audioDrawer.guard.soxrFallback.description': 'Default on. Shared SOXR resampling falls back to FFmpeg default if SOXR is unavailable before PCM starts.',
  'audioDrawer.guard.soxrFallback.title': 'SOXR fallback guard',
  'audioDrawer.latency.balanced': 'Balanced',
  'audioDrawer.latency.balancedDetail': '2048 frames',
  'audioDrawer.latency.lowLatency': 'Low latency',
  'audioDrawer.latency.lowLatencyDetail': 'Fast skips / stable fallback',
  'audioDrawer.latency.stable': 'Stable',
  'audioDrawer.latency.stableDetail': '8192 frames',
  'audioDrawer.mode.exclusive': 'Exclusive',
  'audioDrawer.mode.exclusiveCandidate': 'Exclusive candidate',
  'audioDrawer.mode.directSound': 'DirectSound Compatibility',
  'audioDrawer.mode.shared': 'Shared',
  'audioDrawer.note.asio': 'Low-latency professional audio interface support requires a driver.',
  'audioDrawer.note.asioWarning': 'ASIO takes over your audio channels. Use it only with an official or trusted ASIO driver; installing obscure virtual drivers just to force ASIO is not recommended, has limited benefit, and may make playback unstable.',
  'audioDrawer.note.outputResponsibilityTitle': 'Exclusive / ASIO Note',
  'audioDrawer.note.outputResponsibilityPrimary': 'If you are driving headphones or speakers directly, Exclusive mode is usually unnecessary. If Exclusive / ASIO causes problems while Shared mode is fine, check your DAC, sound card, driver, and connection path first instead of treating it as a software bug immediately. If you want less hassle, use a dedicated DAC.',
  'audioDrawer.note.outputResponsibilitySecondary': 'If problems still happen with a dedicated DAC, try Settings - Playback - Reset engine. If it still fails, send an error report in the group chat.',
  'audioDrawer.note.currentOutput': 'This shows the output path in use. Shared is for daily listening; ASIO and WASAPI Exclusive are highlighted in gold.',
  'audioDrawer.note.engine': 'Quickly check the output device, mode, sample rate, EQ, and resampling state.',
  'audioDrawer.note.juceOutput': 'Default main output. FFmpeg keeps decoding; JUCE owns output and falls back to the compatibility path if it fails.',
  'audioDrawer.note.juceDecode': 'Off by default. Tries JUCE decode for local WAV/FLAC/MP3 files that need no resampling; MP3 uses Windows Media and falls back to FFmpeg on failure.',
  'audioDrawer.note.dsdDop': 'Off by default. Tries DoP direct output for local DSF in Exclusive or ASIO; falls back to FFmpeg PCM on failure. Trust the DAC display.',
  'audioDrawer.note.asioNativeDsd': 'Off by default. Tries only for ASIO + local DSF + DoP with no EQ, volume, speed, or DSP; falls back to the existing DoP/PCM path on failure.',
  'audioDrawer.note.releaseExclusiveOnPause': 'Experimental. Pause releases WASAPI Exclusive so other apps can play; resume tries Exclusive again and temporarily falls back to Shared if needed.',
  'audioDrawer.option.juceOutput': 'JUCE Main Output',
  'audioDrawer.option.juceDecode': 'JUCE Decode Experiment',
  'audioDrawer.option.dsdDop': 'DSD DoP Direct Experiment',
  'audioDrawer.option.asioNativeDsd': 'ASIO Native DSD Experiment',
  'audioDrawer.option.releaseExclusiveOnPause': 'Release Exclusive on Pause',
  'audioDrawer.option.active': 'On',
  'audioDrawer.option.set': 'Set',
  'audioDrawer.option.automix': 'Enable Automix',
  'audioDrawer.option.automixActive': 'Current playback is running through the Automix premix path.',
  'audioDrawer.option.automixDescription': 'Off by default. When enabled, continuous queue playback overlaps the current outro with the next intro using an automatic crossfade.',
  'audioDrawer.option.rememberOutput': 'Save Output Settings',
  'audioDrawer.option.rememberOutputDescription': 'Restores the selected output device, output mode, buffer, and related settings on the next launch.',
  'audioDrawer.option.showAsioPanelSettings': 'Show ASIO panel settings',
  'audioDrawer.option.showAsioPanelSettingsDescription': 'Off by default. When enabled, ASIO devices show an Open ASIO Panel button.',
  'audioDrawer.option.directSound': 'DirectSound Compatibility',
  'audioDrawer.option.directSoundDescription': 'Manual compatibility mode with high latency; try only when WASAPI playback fails.',
  'audioDrawer.option.sharedBackend': 'Shared backend',
  'audioDrawer.option.wasapiShared': 'WASAPI Shared',
  'audioDrawer.option.wasapiSharedDescription': 'Everyday Windows shared output path.',
  'audioDrawer.option.wasapiExclusive': 'WASAPI Exclusive Mode',
  'audioDrawer.option.wasapiExclusiveDescription': 'Shared is the everyday Windows path. Exclusive opens the same device without the shared mixer and is recommended only when your DAC or audio interface and driver are known to be stable; onboard Realtek-style drivers can be fragile and may cause silence, stutter, or switch failures.',
  'audioDrawer.section.advancedOutput': 'Advanced Output',
  'audioDrawer.section.automix': 'Automix',
  'audioDrawer.section.asioDevices': 'ASIO Output Devices',
  'audioDrawer.section.currentOutput': 'Current Output',
  'audioDrawer.section.hiddenDevices': 'Hidden Devices',
  'audioDrawer.section.systemDevices': 'System Output Devices',
  'audioDrawer.signal.balanceDsp': 'Balance DSP',
  'audioDrawer.signal.bitPerfect': 'Bit-perfect',
  'audioDrawer.signal.dspOn': 'DSP On',
  'audioDrawer.signal.eqOff': 'EQ Off',
  'audioDrawer.signal.eqOn': 'EQ On',
  'audioDrawer.signal.asioSdkOutput': 'ASIO SDK output',
  'audioDrawer.signal.ffmpegDecode': 'FFmpeg decode',
  'audioDrawer.signal.dsdDop': 'DSF bitstream -> DoP',
  'audioDrawer.signal.dsdDopFallback': 'DSD DoP fallback',
  'audioDrawer.signal.dsdDopStandby': 'DoP not used',
  'audioDrawer.signal.juceDecode': 'JUCE decode',
  'audioDrawer.signal.juceDecodeFallback': 'JUCE decode fallback',
  'audioDrawer.signal.juceDecodeStandby': 'JUCE decode not used',
  'audioDrawer.signal.nativeRate': 'Native Rate',
  'audioDrawer.signal.noActiveSource': 'No active source',
  'audioDrawer.signal.pending': 'Pending',
  'audioDrawer.signal.processed': 'Processed',
  'audioDrawer.signal.sharedMixer': 'Shared Mixer',
  'audioDrawer.signal.standardPath': 'Standard path',
  'audioDrawer.status.noTrack': 'No track',
  'audioDrawer.status.ratePending': 'Rate pending',
  'audioDrawer.status.sampleRatePending': 'Sample rate pending',
  'audioDrawer.title': 'Audio Settings',
  'audioDrawer.todo.outputControls': 'Target sample rate and buffer controls',
  'audioDrawer.todo.outputControlsDescription': 'TODO: wire to real audio settings when DeviceService exposes safe controls.',
  'audioDrawer.troubleshooting.description': 'Use this when audio is stuck or the device list looks wrong. The soft restart only affects ECHO.',
  'audioDrawer.troubleshooting.hardAction': 'Restart Windows Audio Service',
  'audioDrawer.troubleshooting.hardBusy': 'Restarting Windows Audio Service',
  'audioDrawer.troubleshooting.hardConfirm': 'This will interrupt audio from all apps (Chrome, games, calls) and requires administrator permission. Continue?',
  'audioDrawer.troubleshooting.hardDone': 'Windows audio service recovered. You can start playback again.',
  'audioDrawer.troubleshooting.softAction': 'Restart Audio Engine',
  'audioDrawer.troubleshooting.softBusy': 'Restarting Audio Engine',
  'audioDrawer.troubleshooting.softDone': 'Audio engine restarted. You can start playback again.',
  'audioDrawer.troubleshooting.title': 'Audio Troubleshooting',
  'folders.action.addScan': 'Add + scan',
  'folders.action.browse': 'Browse',
  'folders.action.cancel': 'Cancel',
  'folders.action.open': 'Open',
  'folders.action.play': 'Play',
  'folders.action.queue': 'Queue',
  'folders.action.random': 'Random',
  'folders.action.refresh': 'Refresh folders',
  'folders.action.remove': 'Remove',
  'folders.action.scan': 'Scan',
  'folders.confirm.deleteTrack': 'Delete the music file?\n{title}',
  'folders.confirm.removeRoot': 'Remove "{name}" from the library index? Music files stay on disk.',
  'folders.count.tracks': '{count} tracks',
  'folders.detail.importHint': 'Import a music folder to build a path-based library view.',
  'folders.detail.libraryFolders': 'Library folders',
  'folders.detail.root': 'Root',
  'folders.detail.selectFolder': 'Select a folder',
  'folders.detail.subfolder': 'Subfolder',
  'folders.duration.hours': '{count} hr',
  'folders.duration.hoursMinutes': '{hours} hr {minutes} min',
  'folders.duration.minutes': '{count} min',
  'folders.empty.noScan': 'No scan has run for this root yet.',
  'folders.empty.roots': 'No library folders yet.',
  'folders.error.actionFailed': 'Folder action failed.',
  'folders.error.desktopEditTags': 'Desktop bridge unavailable. Open ECHO Next desktop to edit embedded tags.',
  'folders.error.desktopFileActions': 'Desktop bridge unavailable. Open ECHO Next desktop to use file actions.',
  'folders.error.desktopImport': 'Desktop bridge unavailable. Open ECHO Next desktop to import folders.',
  'folders.error.desktopManage': 'Desktop bridge unavailable. Open ECHO Next desktop to manage folders.',
  'folders.error.noCoverSaved': 'No cover art was saved for this track.',
  'folders.error.noCoverToCopy': 'This track does not have cover art to copy.',
  'folders.error.notFolder': 'The selected path is not a folder.',
  'folders.error.pathMissing': 'Folder path does not exist.',
  'folders.error.permission': 'ECHO does not have permission to access this folder.',
  'folders.error.trackActionUnavailable': 'This track action is not available yet.',
  'folders.filters.includeSubfolders': 'Include subfolders',
  'folders.filters.label': 'Folder track filters',
  'folders.filters.searchPlaceholder': 'Search this folder...',
  'folders.message.addedToPlaylist': 'Added to playlist: {name}',
  'folders.message.alreadyScanning': 'This library root is already scanning.',
  'folders.message.folderAddedScanStarted': 'Folder added. Scan started in the background.',
  'folders.message.folderRemoved': 'Folder removed from the library index.',
  'folders.message.loadedPartial': 'Loaded first {loaded} of {total} tracks to keep memory low.',
  'folders.message.loadedTracks': 'Loaded {count} tracks.',
  'folders.message.noPlayableTracks': 'No playable tracks in this folder.',
  'folders.message.queuedTracks': 'Queued {count} tracks.',
  'folders.message.scanCancelled': 'Scan cancelled.',
  'folders.message.scanStarted': 'Scan started.',
  'folders.metrics.duration': 'Duration',
  'folders.metrics.label': 'Folder metrics',
  'folders.metrics.size': 'Size',
  'folders.metrics.subfolders': 'Subfolders',
  'folders.metrics.tracks': 'Tracks',
  'folders.panel.addFolder': 'Add folder',
  'folders.panel.import': 'Import',
  'folders.panel.manage': 'Manage',
  'folders.panel.scan': 'Scan',
  'folders.panel.selectedRoot': 'Selected root',
  'folders.panel.status': 'Status',
  'folders.phase.checkingCache': 'Checking cache',
  'folders.phase.discovering': 'Finding files',
  'folders.phase.extractingCovers': 'Covers',
  'folders.phase.finished': 'Finished',
  'folders.phase.groupingAlbums': 'Albums',
  'folders.phase.readingMetadata': 'Reading tags',
  'folders.phase.writingDatabase': 'Writing',
  'folders.prompt.choosePlaylist': 'Choose playlist number:\n{names}',
  'folders.prompt.createPlaylist': 'No playlists yet. Enter a name to create one:',
  'folders.queueSource.recursive': '{name} folder',
  'folders.scan.progress': '{processed}/{total} files, {errors} errors',
  'folders.sidebar.kicker': 'Library',
  'folders.sidebar.title': 'Folders',
  'folders.sort.album': 'Album',
  'folders.sort.artist': 'Artist',
  'folders.sort.duration': 'Duration',
  'folders.sort.quality': 'Quality',
  'folders.sort.random': 'Random',
  'folders.sort.recent': 'Recently updated',
  'folders.sort.title': 'Title',
  'folders.status.cancelled': 'Cancelled',
  'folders.status.completed': 'Complete',
  'folders.status.failed': 'Failed',
  'folders.status.queued': 'Queued',
  'folders.status.running': 'Scanning',
  'folders.statusLine.loadingTracks': 'Loading folder tracks...',
  'folders.statusLine.preparingQueue': 'Preparing folder queue...',
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
  'route.connect.description': 'DLNA / AirPlay wireless playback.',
  'route.connect.label': 'Connect',
  'route.downloads.description': 'Download queue placeholder.',
  'route.downloads.label': 'Downloads',
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
  'route.lyrics.description': 'Lyrics and immersive playback.',
  'route.lyrics.label': 'Lyrics',
  'route.lyricsSettings.description': 'Lyrics preferences.',
  'route.lyricsSettings.label': 'Lyrics Settings',
  'route.mvSettings.description': 'MV binding and local matching settings.',
  'route.mvSettings.label': 'MV Settings',
  'mvSettings.action.chooseFile': 'Choose file',
  'mvSettings.action.close': 'Close MV settings',
  'mvSettings.action.collapseNetwork': 'Collapse network sources',
  'mvSettings.action.dragReorder': 'Drag to set priority',
  'mvSettings.action.dragSource': 'Drag {provider} to set priority',
  'mvSettings.action.expandNetwork': 'Expand network sources',
  'mvSettings.action.findLocal': 'Find local',
  'mvSettings.action.openExternal': 'Open selected MV externally',
  'mvSettings.action.refresh': 'Refresh',
  'mvSettings.action.removeSelected': 'Remove selected MV',
  'mvSettings.action.searchNetwork': 'Search network MV',
  'mvSettings.aria.candidates': 'MV candidates',
  'mvSettings.aria.drawer': 'MV settings',
  'mvSettings.aria.engineStatus': 'MV engine status',
  'mvSettings.aria.maxQuality': 'Max quality {quality}',
  'mvSettings.aria.maxQualityOptions': 'Max quality options',
  'mvSettings.aria.networkSources': 'Network source priority',
  'mvSettings.aria.selectedQuality': 'Selected MV quality {quality}',
  'mvSettings.aria.selectedQualityOptions': 'Selected MV quality options',
  'mvSettings.badge.credentialsMain': 'Credentials stay in main',
  'mvSettings.badge.proxyOnly': 'Proxy only',
  'mvSettings.binding.selectedMv': 'Selected MV',
  'mvSettings.binding.title': 'MV Source',
  'mvSettings.candidate.external': 'External',
  'mvSettings.candidate.inApp': 'In-app',
  'mvSettings.custom.apply': 'Apply custom MV',
  'mvSettings.custom.description': 'Paste a YouTube or Bilibili video link as the current MV.',
  'mvSettings.custom.directDash': 'Direct stream (DASH)',
  'mvSettings.custom.input': 'Custom MV link',
  'mvSettings.custom.placeholder': 'https://youtube.com/watch?v=... or BVxxxxxxxx',
  'mvSettings.custom.playing': 'Now playing: {provider} - {sourceId}',
  'mvSettings.custom.title': 'Custom MV',
  'mvSettings.custom.videoTitle': 'Video title: {title}',
  'mvSettings.engine.mvTitle': 'MV Title',
  'mvSettings.engine.network': 'Network',
  'mvSettings.engine.quality': 'Quality',
  'mvSettings.engine.selected': 'Selected',
  'mvSettings.engine.title': 'MV Engine',
  'mvSettings.error.noActiveTrackBinding': 'No active library track for MV binding',
  'mvSettings.error.noActiveTrackMatching': 'No active library track for MV matching',
  'mvSettings.error.noActiveTrackNetworkSearch': 'No active library track for network MV search',
  'mvSettings.error.noLocalCandidates': 'No local MV candidates found',
  'mvSettings.error.noNetworkCandidates': 'No network MV candidates found',
  'mvSettings.general.enabled': 'Enable MV',
  'mvSettings.immersive.blur': 'Glass blur',
  'mvSettings.immersive.brightness': 'Background brightness',
  'mvSettings.immersive.description': 'Use the current MV as the lyrics page background.',
  'mvSettings.immersive.dragHint': 'Drag empty space on the lyrics page to fine tune it.',
  'mvSettings.immersive.lyricsReadability': 'Lyrics readability boost',
  'mvSettings.immersive.lyricsReadabilityDescription': 'Adds outline and shadow to lyrics over immersive MV.',
  'mvSettings.immersive.overlay': 'Dark overlay',
  'mvSettings.immersive.overlayHint': 'Lower keeps the MV closer to the original; higher keeps lyrics clearer.',
  'mvSettings.immersive.positionX': 'Horizontal position',
  'mvSettings.immersive.positionY': 'Vertical position',
  'mvSettings.immersive.reset': 'Reset immersive background',
  'mvSettings.immersive.title': 'Immersive MV background',
  'mvSettings.immersive.visualHint': 'Tune how the immersive background looks.',
  'mvSettings.immersive.zoom': 'Background zoom',
  'mvSettings.network.autoApply': 'Auto search network MV',
  'mvSettings.network.autoApplyThreshold': 'Auto-apply match',
  'mvSettings.network.autoApplyThresholdDescription': 'Only apply candidates at {threshold} or higher.',
  'mvSettings.network.autoPreload': 'Preload MV',
  'mvSettings.network.autoPreloadDescription': 'When enabled, playing a song will look up and prepare its MV ahead of time.',
  'mvSettings.network.maxQuality': 'Max quality',
  'mvSettings.network.replayAudioOnChange': 'Replay music after switching MV',
  'mvSettings.network.replayAudioOnChangeDescription': 'When enabled, manually selecting or binding a new MV replays the current song so the MV applies immediately.',
  'mvSettings.network.restartAudioOnLoad': 'Follow music progress',
  'mvSettings.network.restartAudioOnLoadDescription': 'When enabled, only the MV video time is corrected. Audio is not seeked or restarted, and lyrics sync offsets do not affect the MV.',
  'mvSettings.network.title': 'Network Sources',
  'mvSettings.offset.aria': 'MV sync offset',
  'mvSettings.offset.description': 'Saved only for this song MV; other songs are unaffected.',
  'mvSettings.offset.earlier': 'MV earlier {value}',
  'mvSettings.offset.later': 'MV later {value}',
  'mvSettings.offset.reset': 'Reset MV offset',
  'mvSettings.offset.title': 'This song MV offset',
  'mvSettings.provider.local': 'Local',
  'mvSettings.quality.max': 'Max',
  'mvSettings.search.input': 'MV search keywords',
  'mvSettings.search.placeholder': 'Enter MV search keywords',
  'mvSettings.search.useCurrentSong': 'Search with current song and artist',
  'mvSettings.status.auto': 'Auto',
  'mvSettings.status.noActiveTrack': 'No active track',
  'mvSettings.status.none': 'None',
  'mvSettings.status.off': 'Off',
  'mvSettings.status.on': 'On',
  'mvSettings.title': 'MV Settings',
  'trackMenu.action.addToPlaylist': 'Add to playlist...',
  'trackMenu.action.playNext': 'Play next',
  'trackMenu.action.addToQueue': 'Add to queue',
  'trackMenu.action.like': 'Like',
  'trackMenu.action.unlike': 'Unlike',
  'trackMenu.action.removeFromQueue': 'Remove from playback queue',
  'trackMenu.action.openOsuTiming': 'osu! Timing',
  'trackMenu.action.editTags': 'Edit tags',
  'trackMenu.action.reloadEmbeddedTags': 'Reload embedded tags',
  'trackMenu.action.goToAlbum': 'Go to album',
  'trackMenu.action.showInFolder': 'Show in folder',
  'trackMenu.action.copyPath': 'Copy file path',
  'trackMenu.action.openSystem': 'Open with system default app',
  'trackMenu.action.copyNameArtist': 'Copy title and artist',
  'trackMenu.action.copyCover': 'Copy song card image',
  'trackMenu.action.saveCover': 'Save song card image',
  'trackMenu.action.deleteSong': 'Delete song',
  'route.playlists.description': 'User playlists.',
  'route.playlists.label': 'Playlists',
  'route.queue.description': 'Playback queue.',
  'route.queue.label': 'Queue',
  'queue.action.clear': 'Clear queue',
  'queue.action.dragLabel': 'Drag {title}',
  'queue.action.dragTitle': 'Drag to reorder',
  'queue.action.generateFromHistory': 'Generate from history',
  'queue.action.generateRandom': 'Generate random queue',
  'queue.action.generatingHistory': 'Generating',
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
  'queue.error.noHistoryTracks': 'No playback history is available to build a queue yet.',
  'queue.error.noRandomTracks': 'Your library does not have any tracks for a random queue yet.',
  'queue.header.kicker': 'Playback Queue',
  'queue.header.title': 'Queue',
  'queue.historySource': 'Frequent history',
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
  'settings.nav.shortcuts.label': 'Shortcuts',
  'settings.nav.shortcuts.description': 'Global keys, play/pause, previous, next',
  'settings.eq.action.autoPreamp': 'Auto {value}',
  'settings.eq.action.bypass': 'Bypass',
  'settings.eq.action.delete': 'Delete',
  'settings.eq.action.duplicatePreset': 'Duplicate current',
  'settings.eq.action.freqDown': 'Freq -',
  'settings.eq.action.freqFineDown': 'Fine -',
  'settings.eq.action.freqFineUp': 'Fine +',
  'settings.eq.action.freqUp': 'Freq +',
  'settings.eq.action.holdBypass': 'Hold to Bypass EQ',
  'settings.eq.action.hideAdvanced': 'Hide advanced',
  'settings.eq.action.applyA': 'Apply A',
  'settings.eq.action.applyB': 'Apply B',
  'settings.eq.action.applySafePreamp': 'Apply safe preamp',
  'settings.eq.action.overwrite': 'Overwrite',
  'settings.eq.action.redo': 'Redo',
  'settings.eq.action.resetBand': 'Reset {frequency}',
  'settings.eq.action.resetAllGains': 'Reset all gains',
  'settings.eq.action.resetChannelBalance': 'Reset channel balance',
  'settings.eq.action.resetEq': 'Reset EQ',
  'settings.eq.action.resetFrequencies': 'Standard bands',
  'settings.eq.action.resetMonitorTools': 'Reset monitor tools',
  'settings.eq.action.resetSelected': 'Reset selected',
  'settings.eq.action.resetTrimsOnly': 'Reset trims only',
  'settings.eq.action.revertUserPreset': 'Revert user preset',
  'settings.eq.action.save': 'Save',
  'settings.eq.action.saveAs': 'Save as',
  'settings.eq.action.showAdvanced': 'Advanced',
  'settings.eq.action.storeA': 'Store A',
  'settings.eq.action.storeB': 'Store B',
  'settings.eq.action.toggleBypassOff': 'Disable bypass',
  'settings.eq.action.toggleBypassOn': 'Toggle Bypass',
  'settings.eq.action.undo': 'Undo',
  'settings.eq.action.unlockFrequency': 'Unlock frequency',
  'settings.eq.ab.emptySlot': 'Empty slot',
  'settings.eq.ab.loudnessMatched': 'Loudness matched',
  'settings.eq.ab.summary': '{preset} / peak {peak} / out {output} / preamp {preamp}',
  'settings.eq.ab.title': 'A/B Compare',
  'settings.eq.band.fallback': 'Band',
  'settings.eq.band.frequency': 'Frequency',
  'settings.eq.band.frequencyStepper': 'Frequency stepper',
  'settings.eq.band.frequencySnapped': 'Snapped to standard bands',
  'settings.eq.band.frequencyUnlocked': 'Free frequency',
  'settings.eq.band.gain': 'Gain',
  'settings.eq.band.gainStepper': 'Gain stepper',
  'settings.eq.band.inspector': 'Selected band',
  'settings.eq.band.readoutsAria': '10-band EQ draggable band readouts',
  'settings.eq.bitPerfect.channelDisabled': 'DSP active: bit-perfect disabled.',
  'settings.eq.bitPerfect.disabled': 'DSP active: bit-perfect disabled{reason}.',
  'settings.eq.bitPerfect.readyPath': 'Bit-perfect path can be preserved.',
  'settings.eq.bitPerfect.sourceBoth': 'EQ + Channel Balance',
  'settings.eq.bitPerfect.sourceChannel': 'Channel Balance',
  'settings.eq.bitPerfect.sourceEq': 'EQ',
  'settings.eq.channel.active': 'Active',
  'settings.eq.channel.balance': 'Balance',
  'settings.eq.channel.bypassed': 'Bypassed',
  'settings.eq.channel.calibrationMode': 'Calibration mode',
  'settings.eq.channel.center': 'Center',
  'settings.eq.channel.constantPower': 'Constant Power',
  'settings.eq.channel.description': 'Balance shifts left/right. L/R Gain fine-tunes correction. Mono Sum checks mono. Invert checks phase.',
  'settings.eq.channel.dsp': 'DSP',
  'settings.eq.channel.effectiveLeft': 'Effective L',
  'settings.eq.channel.effectiveRight': 'Effective R',
  'settings.eq.channel.group.balance': 'Balance',
  'settings.eq.channel.group.gainTrim': 'Gain Trim',
  'settings.eq.channel.group.monitorTools': 'Monitor Tools',
  'settings.eq.channel.group.phaseTools': 'Phase Tools',
  'settings.eq.channel.invertLeft': 'Invert Left',
  'settings.eq.channel.invertRight': 'Invert Right',
  'settings.eq.channel.leftGain': 'Left Gain',
  'settings.eq.channel.leftTotal': 'Left total',
  'settings.eq.channel.mono.left': 'Left',
  'settings.eq.channel.mono.off': 'Off',
  'settings.eq.channel.mono.right': 'Right',
  'settings.eq.channel.mono.sum': 'Sum',
  'settings.eq.channel.monoMode': 'Mono mode',
  'settings.eq.channel.quick.leftSolo': 'Left Solo',
  'settings.eq.channel.quick.monoCheck': 'Mono Check',
  'settings.eq.channel.quick.phaseCheck': 'Phase Check',
  'settings.eq.channel.quick.rightSolo': 'Right Solo',
  'settings.eq.channel.quick.swapCheck': 'Swap Check',
  'settings.eq.channel.quickTools': 'Quick monitor tools',
  'settings.eq.channel.rightGain': 'Right Gain',
  'settings.eq.channel.rightTotal': 'Right total',
  'settings.eq.channel.swap': 'Swap L/R',
  'settings.eq.channel.title': 'Channel Balance',
  'settings.eq.curve.aria': 'Draggable 10-band EQ frequency response',
  'settings.eq.curve.dragBand': 'Drag {frequency} EQ band',
  'settings.eq.curve.fineEdit': 'Shift fine edit',
  'settings.eq.curve.freeFrequency': 'Free frequency',
  'settings.eq.curve.snapped': 'Snapped',
  'settings.eq.error.bridgeChannelBalance': 'Desktop bridge unavailable. Open ECHO Next in Electron to control channel balance.',
  'settings.eq.error.bridgeControlEq': 'Desktop bridge unavailable. Open ECHO Next in Electron to control EQ.',
  'settings.eq.error.bridgeDeletePreset': 'Desktop bridge unavailable. Open ECHO Next in Electron to delete EQ presets.',
  'settings.eq.error.bridgeSavePreset': 'Desktop bridge unavailable. Open ECHO Next in Electron to save EQ presets.',
  'settings.eq.error.presetName': 'Enter a preset name before saving.',
  'settings.eq.level.clips': 'Clips {count}',
  'settings.eq.level.estimatedOutputPeak': 'Est. output peak',
  'settings.eq.level.headroom': 'Headroom',
  'settings.eq.level.inputPeak': 'Input peak',
  'settings.eq.level.inputRms': 'Input RMS',
  'settings.eq.level.sourceEstimate': 'pre-native + DSP estimate',
  'settings.eq.preamp.aria': 'EQ preamp',
  'settings.eq.preamp.inputSafety': 'Input safety estimate',
  'settings.eq.preamp.maxBoost': 'Max boost',
  'settings.eq.preamp.metricsAria': 'Headroom safety metrics',
  'settings.eq.preamp.recommended': 'Recommended',
  'settings.eq.preamp.safeHeadroom': 'Safe Headroom',
  'settings.eq.preset.approximation': '10-band approximation',
  'settings.eq.preset.builtIn': 'Built-in presets',
  'settings.eq.preset.copyName': 'Copy of {name}',
  'settings.eq.preset.filter.all': 'All',
  'settings.eq.preset.filter.builtIn': 'Built-in',
  'settings.eq.preset.filter.genre': 'Genre',
  'settings.eq.preset.filter.target': 'Target curves',
  'settings.eq.preset.filter.user': 'User',
  'settings.eq.preset.filter.utility': 'Utility',
  'settings.eq.preset.filterAria': 'Preset filter',
  'settings.eq.preset.meta.approximationCaution': 'This is a 10-band graphic EQ approximation, not exact headphone calibration.',
  'settings.eq.preset.meta.genrePurpose': 'Shapes the playback toward a familiar genre voicing.',
  'settings.eq.preset.meta.genreScenario': 'Useful for quick listening by style before device-specific tweaks.',
  'settings.eq.preset.meta.targetPurpose': 'Approximates a common listening target curve.',
  'settings.eq.preset.meta.targetScenario': 'Useful for headphone or near-field target comparisons.',
  'settings.eq.preset.meta.tasteCaution': 'This is a voicing choice, not a calibration result.',
  'settings.eq.preset.meta.type.animeJpop': 'Anime / J-Pop',
  'settings.eq.preset.meta.type.bassBoost': 'Bass Boost',
  'settings.eq.preset.meta.type.bkRoomCurve': 'B&K Room Curve',
  'settings.eq.preset.meta.type.broadcastVoice': 'Broadcast Voice',
  'settings.eq.preset.meta.type.classicSmiley': 'Classic Smiley',
  'settings.eq.preset.meta.type.classical': 'Classical',
  'settings.eq.preset.meta.type.diffuseField': 'Diffuse Field',
  'settings.eq.preset.meta.type.flat': 'Flat',
  'settings.eq.preset.meta.type.harmanInEar': 'Harman In-Ear',
  'settings.eq.preset.meta.type.harmanTarget': 'Harman Target',
  'settings.eq.preset.meta.type.headphoneWarm': 'Headphone Warm',
  'settings.eq.preset.meta.type.loudness': 'Loudness',
  'settings.eq.preset.meta.type.night': 'Night',
  'settings.eq.preset.meta.type.rock': 'Rock',
  'settings.eq.preset.meta.type.studioNeutral': 'Studio Neutral',
  'settings.eq.preset.meta.type.trebleSparkle': 'Treble Sparkle',
  'settings.eq.preset.meta.type.vinylWarmth': 'Vinyl Warmth',
  'settings.eq.preset.meta.type.vocalClear': 'Vocal Clear',
  'settings.eq.preset.meta.utilityCaution': 'Utility presets can change monitoring judgment; confirm before saving.',
  'settings.eq.preset.meta.utilityPurpose': 'Supports checks, compensation, or safer monitoring.',
  'settings.eq.preset.meta.utilityScenario': 'Useful for finding issues, reducing fatigue, or quick comparisons.',
  'settings.eq.preset.modified': 'Modified',
  'settings.eq.preset.nameAria': 'Preset name',
  'settings.eq.preset.readonly': 'Built-in presets are read-only.',
  'settings.eq.preset.savePlaceholder': 'Save as user preset',
  'settings.eq.preset.searchAria': 'Search presets',
  'settings.eq.preset.searchPlaceholder': 'Search presets',
  'settings.eq.preset.selectorAria': 'EQ preset',
  'settings.eq.preset.user': 'User presets',
  'settings.eq.state.eqDisabled': 'EQ Disabled',
  'settings.eq.state.eqEnabled': 'EQ Enabled',
  'settings.eq.status.bitPerfect': 'Bit-perfect',
  'settings.eq.status.clippingRisk': 'Clipping Risk',
  'settings.eq.status.eq': 'EQ',
  'settings.eq.status.estimatedPeak': 'Estimated Peak',
  'settings.eq.status.headroom': 'Headroom',
  'settings.eq.status.preamp': 'Preamp',
  'settings.eq.status.preset': 'Preset',
  'settings.eq.status.safe': 'Safe',
  'settings.eq.status.safeHeadroomShort': 'Safe headroom',
  'settings.eq.status.warning': 'Warning',
  'settings.eq.subtitle': 'HiFi DSP panel',
  'settings.eq.title': '10-band Graphic EQ',
  'settings.eq.warning.channelClipping': 'Clipping risk: lower gain or preamp for safer headroom.',
  'settings.eq.warning.lowerPreamp': 'Lower Preamp to avoid clipping.',
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
  'settings.playback.sharedBackend.description': 'DirectSound is a manual compatibility mode with high latency; keep WASAPI Shared for daily playback.',
  'settings.playback.sharedBackend.directSound': 'DirectSound Compatibility',
  'settings.playback.sharedBackend.title': 'Shared Backend',
  'settings.playback.sharedBackend.wasapi': 'WASAPI Shared',
  'settings.playback.outputDevice.title': 'Output Device',
  'settings.playback.outputDevice.description': 'Device list from echo-audio-host. When no device is available, default output is kept.',
  'settings.playback.outputDevice.empty': 'No available devices',
  'settings.playback.resetEngine.action': 'Restart Audio Engine',
  'settings.playback.resetEngine.busy': 'Restarting',
  'settings.playback.resetEngine.description': 'Stops current playback and releases the native audio host. Try this when a device or driver gets stuck before restarting the app.',
  'settings.playback.resetEngine.done': 'Audio engine restarted. You can start playback again.',
  'settings.playback.resetEngine.title': 'Restart Audio Engine',
  'settings.playback.troubleshooting.description': 'Use this when audio is stuck or the device list looks wrong. The soft restart only affects ECHO.',
  'settings.playback.troubleshooting.hardAction': 'Restart Windows Audio Service',
  'settings.playback.troubleshooting.hardBusy': 'Restarting Windows Audio Service',
  'settings.playback.troubleshooting.hardConfirm': 'This will interrupt audio from all apps (Chrome, games, calls) and requires administrator permission. Continue?',
  'settings.playback.troubleshooting.hardDone': 'Windows audio service recovered. You can start playback again.',
  'settings.playback.troubleshooting.softAction': 'Restart Audio Engine',
  'settings.playback.troubleshooting.softBusy': 'Restarting Audio Engine',
  'settings.playback.troubleshooting.softDone': 'Audio engine restarted. You can start playback again.',
  'settings.playback.troubleshooting.title': 'Audio Troubleshooting',
  'settings.playback.wireless.title': 'Wireless Playback',
  'settings.playback.wireless.description': 'This will connect in a later HiFi engine phase. The current phase does not migrate gapless / automix / streaming.',
  'settings.playback.followCurrent.title': 'Follow Current Track',
  'settings.playback.followCurrent.description': 'When enabled, the current list scrolls to the playing track after track changes.',
  'settings.shortcuts.action.clear': 'Clear',
  'settings.shortcuts.action.bossKey.description': 'Hide the window immediately and lower ECHO volume to 0.',
  'settings.shortcuts.action.bossKey.title': 'Boss Key',
  'settings.shortcuts.action.nextTrack.description': 'Jump to the next item in the active playback queue.',
  'settings.shortcuts.action.nextTrack.title': 'Next Track',
  'settings.shortcuts.action.openAudioSettings.description': 'Open the player audio settings drawer.',
  'settings.shortcuts.action.openAudioSettings.title': 'Open Audio Settings',
  'settings.shortcuts.action.openLyricsSettings.description': 'Open the lyrics settings drawer.',
  'settings.shortcuts.action.openLyricsSettings.title': 'Open Lyrics Settings',
  'settings.shortcuts.action.openMvSettings.description': 'Open the MV settings drawer.',
  'settings.shortcuts.action.openMvSettings.title': 'Open MV Settings',
  'settings.shortcuts.action.playPause.description': 'Toggle play and pause globally.',
  'settings.shortcuts.action.playPause.title': 'Play / Pause',
  'settings.shortcuts.action.previousTrack.description': 'Jump to the previous item in the active playback queue.',
  'settings.shortcuts.action.previousTrack.title': 'Previous Track',
  'settings.shortcuts.action.record': 'Record',
  'settings.shortcuts.action.restoreRecommended': 'Restore Recommended',
  'settings.shortcuts.action.seekBackward.description': 'Seek the current track backward by 10 seconds.',
  'settings.shortcuts.action.seekBackward.title': 'Seek Back 10s',
  'settings.shortcuts.action.seekForward.description': 'Seek the current track forward by 10 seconds.',
  'settings.shortcuts.action.seekForward.title': 'Seek Forward 10s',
  'settings.shortcuts.action.showMainWindow.description': 'Bring the ECHO main window to the front.',
  'settings.shortcuts.action.showMainWindow.title': 'Show Main Window',
  'settings.shortcuts.action.speedDown.description': 'Lower playback speed by 0.1x each time.',
  'settings.shortcuts.action.speedDown.title': 'Speed Down',
  'settings.shortcuts.action.speedUp.description': 'Raise playback speed by 0.1x each time.',
  'settings.shortcuts.action.speedUp.title': 'Speed Up',
  'settings.shortcuts.action.stop.description': 'Stop current playback and clear the active playback state.',
  'settings.shortcuts.action.stop.title': 'Stop Playback',
  'settings.shortcuts.action.volumeDown.description': 'Lower ECHO volume by 5%.',
  'settings.shortcuts.action.volumeDown.title': 'Volume Down',
  'settings.shortcuts.action.volumeUp.description': 'Raise ECHO volume by 5%.',
  'settings.shortcuts.action.volumeUp.title': 'Volume Up',
  'settings.shortcuts.description': 'Shortcuts start disabled. Record a single key, combo, media key, or macro-pad key, then enable it on the right.',
  'settings.shortcuts.empty': 'Not bound',
  'settings.shortcuts.message.duplicate': 'That shortcut is already bound to another action.',
  'settings.shortcuts.message.empty': 'Record a shortcut first.',
  'settings.shortcuts.message.invalid': 'That key cannot be used as a global shortcut right now.',
  'settings.shortcuts.message.safe': 'This shortcut is available.',
  'settings.shortcuts.message.unavailable': 'That shortcut is used by the system or another app, so it stayed disabled.',
  'settings.shortcuts.message.unsafe': 'That key cannot be used as a global shortcut right now. You can make the macro pad emit a standard keyboard or media key.',
  'settings.shortcuts.note': 'Single keys, combinations, media keys, macro-pad keys, and mouse side buttons are supported. Mouse side buttons use a dedicated Windows global listener.',
  'settings.shortcuts.recording': 'Press a new shortcut...',
  'settings.shortcuts.title': 'Global Shortcuts',
  'settings.playback.audioStatus.title': 'Audio Status',
  'settings.playback.audioStatus.description': 'Sample-rate fields stay separated to prevent the old ECHO exclusive-mode 48k lock regression.',
  'settings.playback.automix.description': 'Off by default. When enabled, continuous queues prepare the next track early and use the native dual-deck engine to skip tail silence and blend transitions.',
  'settings.playback.automix.title': 'Automix Smart Transitions',
  'settings.playback.stability.action.copied': 'Copied',
  'settings.playback.stability.action.copy': 'Copy Diagnostics',
  'settings.playback.stability.action.refresh': 'Refresh Playback Stability Diagnostics',
  'settings.playback.stability.error.desktopBridgeUnavailable': 'Desktop bridge unavailable.',
  'settings.playback.stability.field.lastSharedStabilityRecoveryAt': 'Last Shared stability recovery',
  'settings.playback.stability.field.lastWatchdogRecoveryTime': 'Last watchdog recovery time',
  'settings.playback.stability.field.nativeBufferedFrames': 'Native buffered frames',
  'settings.playback.stability.field.nativeBufferedMs': 'Native buffered ms',
  'settings.playback.stability.field.nativeDeviceBufferFrames': 'Device buffer frames',
  'settings.playback.stability.field.nativeFifoCapacityFrames': 'Native FIFO capacity frames',
  'settings.playback.stability.field.nativeStartupPrebufferFrames': 'Startup prebuffer frames',
  'settings.playback.stability.field.nativeUnderrunCallbacks': 'Native underrun callbacks',
  'settings.playback.stability.field.nativeUnderrunFrames': 'Native underrun frames',
  'settings.playback.stability.field.recentWatchdogRecoveryCount': 'Recent watchdog recovery count',
  'settings.playback.stability.field.sharedStabilityTier': 'Shared stability tier',
  'settings.playback.stability.field.watchdogStatus': 'Watchdog status',
  'settings.playback.stability.title': 'Playback Stability Diagnostics',
  'settings.playback.stability.value.unknown': 'N/A',
  'settings.integrations.discord.action.refresh': 'Refresh status',
  'settings.integrations.discord.title': 'Discord Status',
  'settings.integrations.discord.description': 'Sync the current playback state to Discord Rich Presence, including track, artist, progress, and play state.',
  'settings.integrations.smtc.description': 'Publish the current track, artwork, timeline, and media-key actions to the Windows volume flyout and lock screen.',
  'settings.integrations.smtc.title': 'Windows Media Controls',
  'settings.integrations.lastfm.action.completeAuth': 'Complete authorization',
  'settings.integrations.lastfm.action.connect': 'Connect Last.fm',
  'settings.integrations.lastfm.action.disconnect': 'Disconnect',
  'settings.integrations.lastfm.action.refresh': 'Refresh status',
  'settings.integrations.lastfm.activeProgress': '{artist} - {title} · {played}/{threshold}s',
  'settings.integrations.lastfm.activeTrack': 'Active track',
  'settings.integrations.lastfm.connection.description': 'Browser authorization is recommended. Click complete after allowing ECHO Next on Last.fm.',
  'settings.integrations.lastfm.connection.title': 'Last.fm connection',
  'settings.integrations.lastfm.description': 'Scrobble local playback from the main process without sending file paths, lyrics, or artwork.',
  'settings.integrations.lastfm.lastNowPlaying': 'Last Now Playing',
  'settings.integrations.lastfm.lastScrobble': 'Last Scrobble',
  'settings.integrations.lastfm.never': 'Not sent yet',
  'settings.integrations.lastfm.noActiveTrack': 'No active track',
  'settings.integrations.lastfm.nowPlaying.description': 'Send one current-track update when playback starts.',
  'settings.integrations.lastfm.nowPlaying.title': 'Last.fm Now Playing',
  'settings.integrations.lastfm.scrobbling.description': 'Submit a play after the track passes the Last.fm timing threshold.',
  'settings.integrations.lastfm.scrobbling.title': 'Last.fm Scrobbling',
  'settings.integrations.lastfm.status.connected': 'Connected {username}',
  'settings.integrations.lastfm.status.error': 'Error: {error}',
  'settings.integrations.lastfm.status.notConnected': 'Not connected',
  'settings.integrations.lastfm.status.pending': 'Authorization pending',
  'settings.integrations.lastfm.statusLabel': 'Status',
  'settings.integrations.lastfm.title': 'Last.fm',
  'settings.integrations.mobile.title': 'Mobile Remote',
  'settings.integrations.mobile.description': 'Future external-device features will go through controlled IPC instead of direct Renderer system access.',
  'settings.library.network.description': 'Manual weak completion only; local embedded metadata always keeps priority.',
  'settings.library.network.title': 'Network Metadata Completion',
  'settings.library.networkSources.description': 'Choose providers used by manual repair and missing-metadata scans.',
  'settings.library.networkSources.title': 'Network Completion Sources',
  'settings.library.networkPanel.applyMissingOnly': 'Apply missing only',
  'settings.library.networkPanel.applySelected': 'Apply selected candidate',
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
  'settings.library.networkPanel.repairMissing': 'Repair current song',
  'settings.library.networkPanel.repairThisTrack': 'Repair this track',
  'settings.library.networkPanel.scanComplete': 'Scan complete',
  'settings.library.networkPanel.scanMissing': 'Scan missing info',
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
  'settings.appearance.theme.description': 'Choose light, dark, or follow the system appearance.',
  'settings.appearance.theme.light': 'Light',
  'settings.appearance.theme.dark': 'Dark',
  'settings.appearance.theme.followSystem': 'Follow System',
  'settings.appearance.themePreset.title': 'Theme Presets',
  'settings.appearance.themePreset.description': 'Choose a global gradient palette; your light, dark, or system mode stays separate.',
  'settings.appearance.themePreset.classic': 'Classic ECHO Next',
  'settings.appearance.themePreset.classic.description': 'Keep the current crisp blue-gray look.',
  'settings.appearance.themePreset.echoTwilight': 'Twilight Peach Mist',
  'settings.appearance.themePreset.echoTwilight.description': 'Warm pink gradients inspired by classic ECHO.',
  'settings.appearance.themePreset.sakuraMilk': 'Sakura Milk',
  'settings.appearance.themePreset.sakuraMilk.description': 'Milky pink with a cherry-red accent.',
  'settings.appearance.themePreset.peachSoda': 'Peach Soda',
  'settings.appearance.themePreset.peachSoda.description': 'Peach orange with a fresh soda-mint lift.',
  'settings.appearance.themePreset.mintCandy': 'Mint Candy',
  'settings.appearance.themePreset.mintCandy.description': 'Mint green, cream white, and a little peach pink.',
  'settings.appearance.themePreset.berryDream': 'Berry Dream',
  'settings.appearance.themePreset.berryDream.description': 'Soft berry purple, cloud white, and dreamy pink light.',
  'settings.appearance.themePreset.matchaCream': 'Matcha Cream',
  'settings.appearance.themePreset.matchaCream.description': 'Matcha green and cream yellow for a calmer cute look.',
  'settings.appearance.themePreset.lemonMochi': 'Lemon Mochi',
  'settings.appearance.themePreset.lemonMochi.description': 'Milky lemon yellow with a soft sky-blue lift.',
  'settings.appearance.themePreset.cottonCloud': 'Cotton Cloud',
  'settings.appearance.themePreset.cottonCloud.description': 'Cloud white, gentle blue, and a soft pink accent.',
  'settings.appearance.themePreset.melonCream': 'Melon Cream',
  'settings.appearance.themePreset.melonCream.description': 'Melon green over cream, cute and readable.',
  'settings.appearance.themePreset.seaSaltJelly': 'Sea Salt Jelly',
  'settings.appearance.themePreset.seaSaltJelly.description': 'Sea-salt cyan with a peachy jelly glow.',
  'settings.appearance.themePreset.caramelPudding': 'Caramel Pudding',
  'settings.appearance.themePreset.caramelPudding.description': 'Creamy caramel with a strawberry glow, sweet but readable.',
  'settings.appearance.themePreset.neonCandy': 'Neon Candy',
  'settings.appearance.themePreset.neonCandy.description': 'Violet neon, pink highlights, and mint bubbles.',
  'settings.appearance.themePreset.nyanCat': 'Nyan Cat',
  'settings.appearance.themePreset.nyanCat.description': 'A slow, cute rainbow gradient with a Nyan Cat progress handle.',
  'settings.appearance.themePreset.wisteriaBubble': 'Wisteria Bubble',
  'settings.appearance.themePreset.wisteriaBubble.description': 'Wisteria mist with mint bubbles, dreamy but fresh.',
  'settings.appearance.themePreset.strawberryCookie': 'Strawberry Cookie',
  'settings.appearance.themePreset.strawberryCookie.description': 'Cream-cookie warmth with strawberry red and baked gold.',
  'settings.appearance.themePreset.graphiteAurora': 'Graphite Aurora',
  'settings.appearance.themePreset.graphiteAurora.description': 'Graphite gray with a quiet green aurora edge.',
  'settings.appearance.themePreset.amberNoir': 'Amber Noir',
  'settings.appearance.themePreset.amberNoir.description': 'Black-gold listening room tones for long dark sessions.',
  'settings.appearance.themePreset.oceanStudio': 'Ocean Studio',
  'settings.appearance.themePreset.oceanStudio.description': 'Cool blue-gray and sea mist for a clean studio feel.',
  'settings.appearance.themePreset.rosewoodVinyl': 'Rosewood Vinyl',
  'settings.appearance.themePreset.rosewoodVinyl.description': 'Warm rosewood reds with a grounded vinyl mood.',
  'settings.appearance.themePreset.darkSideMoon': 'The Dark Side of the Moon',
  'settings.appearance.themePreset.darkSideMoon.description': 'A Pink Floyd tribute: black lunar glass, white prism, and spectral color.',
  'settings.appearance.themePreset.shibuyaNight': 'Shibuya Night',
  'settings.appearance.themePreset.shibuyaNight.description': 'Tokyo neon, night violet streets, and cyan signage glow.',
  'settings.appearance.themePreset.kyotoKurenai': 'Kyoto Kurenai',
  'settings.appearance.themePreset.kyotoKurenai.description': 'Torii red, warm washi paper, and omamori gold.',
  'settings.appearance.themePreset.ukiyoIndigo': 'Ukiyo Indigo',
  'settings.appearance.themePreset.ukiyoIndigo.description': 'Ukiyo-e wave indigo with paper warmth and antique gold.',
  'settings.appearance.themePreset.fujiSnow': 'Fuji First Snow',
  'settings.appearance.themePreset.fujiSnow.description': 'Snow white, Fuji blue, and a pale sakura highlight.',
  'settings.appearance.themePreset.matsuriLantern': 'Matsuri Lantern',
  'settings.appearance.themePreset.matsuriLantern.description': 'Summer festival lantern red, market gold, and warm paper.',
  'settings.appearance.themePreset.ginzaNoir': 'Ginza Noir',
  'settings.appearance.themePreset.ginzaNoir.description': 'Obsidian, champagne gold, and boutique-window blue.',
  'settings.appearance.themePreset.frostJazz': 'Frost Jazz',
  'settings.appearance.themePreset.frostJazz.description': 'Cool blue jazz tones with a plum stage-light accent.',
  'settings.appearance.themeCustom.title': 'Customize Current Theme',
  'settings.appearance.themeCustom.description': 'Choose a theme first, then tune colors. Each theme keeps its own custom colors.',
  'settings.appearance.themeCustom.action.autoFix': 'Auto-fix Text',
  'settings.appearance.themeCustom.action.export': 'Export Parameters',
  'settings.appearance.themeCustom.action.import': 'Import Parameters',
  'settings.appearance.themeCustom.action.reset': 'Reset Custom Colors',
  'settings.appearance.themeCustom.action.save': 'Save Custom Colors',
  'settings.appearance.themeCustom.advanced.show': 'Show Advanced Colors',
  'settings.appearance.themeCustom.advanced.hide': 'Hide Advanced Colors',
  'settings.appearance.themeCustom.field.appBg': 'Base',
  'settings.appearance.themeCustom.field.appBg2': 'Gradient Mid',
  'settings.appearance.themeCustom.field.appBg3': 'Gradient End',
  'settings.appearance.themeCustom.field.panel': 'Glass Tint',
  'settings.appearance.themeCustom.field.panelSoft': 'Soft Panel',
  'settings.appearance.themeCustom.field.accent': 'Primary Accent',
  'settings.appearance.themeCustom.field.accentStrong': 'Secondary Accent',
  'settings.appearance.themeCustom.field.secondary': 'Third Accent',
  'settings.appearance.themeCustom.field.heading': 'Main Text',
  'settings.appearance.themeCustom.field.text': 'Body Text',
  'settings.appearance.themeCustom.field.muted': 'Secondary Text',
  'settings.appearance.themeCustom.field.border': 'Border',
  'settings.appearance.themeCustom.field.onAccent': 'Accent Button Text',
  'settings.appearance.themeCustom.field.buttonText': 'Button Text',
  'settings.appearance.themeCustom.field.panelOpacity': 'Panel Opacity',
  'settings.appearance.themeCustom.field.glass': 'Glass',
  'settings.appearance.themeCustom.field.shadow': 'Shadow',
  'settings.appearance.themeCustom.field.appBg.description': 'Main window base color',
  'settings.appearance.themeCustom.field.appBg2.description': 'Soft middle stop of the background gradient',
  'settings.appearance.themeCustom.field.appBg3.description': 'End stop of the background gradient',
  'settings.appearance.themeCustom.field.panel.description': 'Frosted panel tint',
  'settings.appearance.themeCustom.field.panelSoft.description': 'Sidebar and softer panels',
  'settings.appearance.themeCustom.field.accent.description': 'Main interactions',
  'settings.appearance.themeCustom.field.accentStrong.description': 'Gradient and depth',
  'settings.appearance.themeCustom.field.secondary.description': 'Highlight accents',
  'settings.appearance.themeCustom.field.heading.description': 'Titles and primary copy',
  'settings.appearance.themeCustom.field.text.description': 'Body text, artists, and settings copy',
  'settings.appearance.themeCustom.field.muted.description': 'Supporting copy',
  'settings.appearance.themeCustom.field.border.description': 'Card borders and dividers',
  'settings.appearance.themeCustom.field.onAccent.description': 'Text on accent buttons',
  'settings.appearance.themeCustom.field.buttonText.description': 'Regular buttons and chips',
  'settings.appearance.themeCustom.field.panelOpacity.description': 'How much background shows through panels',
  'settings.appearance.themeCustom.field.glass.description': 'Blur and glass layering',
  'settings.appearance.themeCustom.field.shadow.description': 'Cards, popups, and player shadows',
  'settings.appearance.themeCustom.preview.title': 'Editing',
  'settings.appearance.themeCustom.preview.description': 'Changes preview live and are saved only when you click save.',
  'settings.appearance.themeCustom.group.core': 'Common Colors',
  'settings.appearance.themeCustom.group.core.description': 'Old-ECHO-style palette controls for the most visible colors.',
  'settings.appearance.themeCustom.group.gradient': 'Background Gradient',
  'settings.appearance.themeCustom.group.gradient.description': 'Controls the old-ECHO-style window gradient mood.',
  'settings.appearance.themeCustom.group.advanced': 'Advanced Details',
  'settings.appearance.themeCustom.group.advanced.description': 'Fine tune text, borders, and button text colors.',
  'settings.appearance.themeCustom.message.exported': 'Theme parameters were exported.',
  'settings.appearance.themeCustom.message.imported': 'Theme parameters were imported and applied.',
  'settings.appearance.themeCustom.message.importFailed': 'Import failed. Choose an ECHO theme parameter JSON file.',
  'settings.appearance.themeCustom.message.fixed': 'Text and button colors were adjusted.',
  'settings.appearance.themeCustom.message.invalidColor': 'Use a safe #RRGGBB color.',
  'settings.appearance.themeCustom.message.lowContrast': 'Text contrast is too low. Auto-fix it or darken text before saving.',
  'settings.appearance.themeCustom.message.reset': 'Custom colors for this theme were reset.',
  'settings.appearance.themeCustom.message.saved': 'Custom colors for this theme were saved.',
  'settings.appearance.density.title': 'Interface Density',
  'settings.appearance.density.description': 'Library lists use a tighter desktop density instead of oversized card rows.',
  'settings.appearance.density.compact': 'Compact',
  'settings.appearance.density.standard': 'Standard',
  'settings.appearance.artistAvatars.action.clear': 'Clear Avatar Cache',
  'settings.appearance.artistAvatars.action.queueing': 'Queueing...',
  'settings.appearance.artistAvatars.action.refreshMissing': 'Refresh Missing Avatars',
  'settings.appearance.artistAvatars.description': 'Fetch real artist avatars slowly in the background and reuse local cached images on the artist wall.',
  'settings.appearance.artistAvatars.fallback': 'Use artist album artwork when no avatar is found',
  'settings.appearance.artistAvatars.message.cleared': 'Cleared {removedRows} avatar records and {deletedFiles} files.',
  'settings.appearance.artistAvatars.message.desktopBridgeClear': 'Desktop bridge unavailable. Open ECHO Next in Electron to clear artist avatars.',
  'settings.appearance.artistAvatars.message.desktopBridgeRefresh': 'Desktop bridge unavailable. Open ECHO Next in Electron to refresh artist avatars.',
  'settings.appearance.artistAvatars.message.enableFirst': 'Enable automatic artist avatar fetching first.',
  'settings.appearance.artistAvatars.message.queued': 'Queued {queued} artist avatars. Skipped {skipped}.',
  'settings.appearance.artistAvatars.title': 'Artist Avatars',
  'settings.appearance.artistAvatars.toggle': 'Auto Fetch Artist Avatars',
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
