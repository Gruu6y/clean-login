// The real UI. magpie's launcher frame navigates here with the per-process
// token written into index.html; every request carries that token back.
// There is no fake state: everything shown comes from /api/bootstrap.

import {
  createConfirmController,
  createRequestGuard,
  formatAddress,
  normalizeProxyForm,
  proxyFingerprint,
  statusView,
} from "./proxy-state.js";
import { distinctRegions, filterProxies } from "./proxy-filter.js";
import { isScoreActive, isScoreSettled, scoreView } from "./proxy-score.js";
import {
  localizedText,
  methodCategory,
  methodCategoryText,
  providerCanSignIn,
  providerStatusView,
} from "./provider-state.js";
import { signInActive, signInPayload } from "./signin-state.js";
import {
  accountIdentityPath,
  accountIdentityView,
  accountLabel,
  defaultAccountKey,
  retiredAccounts,
} from "./account-state.js";
import {
  environmentPercent,
  environmentPhase,
  formatBytes,
} from "./environment-state.js";
import { createReloadGuard } from "./reload-guard.js";

const TOKEN_HEADER = "x-clean-login-token";

// One automatic reload per document lifecycle. The guard counts across
// documents through a URL marker; without it a still-mismatched token would
// reload the page forever against the loopback service.
const reloadGuard = createReloadGuard({ location: globalThis.location, history: globalThis.history });

const messages = {
  en: {
    title: "Clean Login",
    subtitle: "Proxy IPs and provider sign-ins.",
    providers: "Providers",
    proxies: "Proxy IPs",
    providersTitle: "Providers",
    providersCopy: "Supported providers and their current sign-in readiness.",
    providersEmptyTitle: "No providers yet",
    providersEmptyCopy: "Supported providers appear here when the local service is ready.",
    providerPending: "Pending verification",
    providerReady: "Ready",
    providerBlocked: "Blocked",
    providersSourceMagpie: "List derived from magpie",
    providersSourceLocal: "magpie list unavailable · using the local list",
    providersDiff: "{both} in both · {localOnly} only local · {magpieOnly} only in magpie",
    providersDiffNone: "The local list matches magpie.",
    providersDiffUnavailable: "magpie's provider list could not be read, so differences cannot be shown.",
    providerMethodsHeading: "Sign-in methods found in installed plugins",
    providerMethodBrowserTag: "browser",
    providerMethodDeviceTag: "device code",
    providerMethodFormTag: "needs details",
    providerMethodLocalTag: "local session",
    providerMethodKeyTag: "key",
    providerMethodSecretTag: "paste a token",
    providerMethodPendingTag: "way to confirm",
    providerMethodUnknownTag: "way to confirm",
    providerMethodNote: "The sign-in way is confirmed when the sign-in starts; the page it opens is the source of truth.",
    providerSourceLineHeading: "List source",
    providerSourceLocal: "local registry",
    providerSourceMagpie: "magpie list",
    providerSourcePlugins: "installed plugin",
    providerPluginsFound: "{count} installed provider entries · {browser} need a browser",
    providerPluginsScanning: "Scanning installed plugins…",
    providerPluginsUnavailable: "Installed plugin scan unavailable",
    addAccount: "Add account",
    signInTitle: "Add account",
    signInCopy: "This opens an isolated browser window. Complete the sign-in there; Clean Login writes the resulting credential into magpie.",
    signInUnverified: "This flow has not been verified in Clean Login yet. You can try it directly; failures are reported honestly and feedback is welcome.",
    signInProxyLabel: "Proxy IP",
    signInProxyDirect: "No proxy (direct)",
    signInMethodLabel: "Sign-in method",
    signInMethodHint: "This provider offers several sign-in methods. Pick the one you want; the wrong one signs you in to the wrong site.",
    signInStart: "Start sign-in",
    signInStarting: "Starting…",
    signInOpened: "The sign-in page is open in an isolated browser window. Please complete the sign-in in that window.",
    signInCancel: "Cancel sign-in",
    signInClose: "Close",
    signInStateAuthorizing: "Authorizing…",
    signInStateWaiting: "Waiting for you to finish in the browser…",
    signInStateFinishing: "Writing the credential into magpie…",
    signInStateDone: "Done",
    signInStateError: "Failed",
    signInStateCancelled: "Cancelled",
    signInAccountKey: "Account key",
    signInAccountLabel: "Continue with an existing identity",
    signInAccountHint: "This identity keeps its own browser fingerprint. Continuing reuses it instead of drawing a new one.",
    signInAccountNew: "New account (new fingerprint)",
    signInDone: "Signed in. The credential was written to magpie.",
    signInCancelled: "The sign-in was cancelled.",
    signInBusy: "A sign-in is already in progress.",
    identitiesTitle: "Account identities",
    identitiesCopy: "Each account keeps its own browser fingerprint. A signed-out identity is kept, so signing in again reuses the same fingerprint instead of drawing a new one.",
    identitiesEmpty: "No signed-out identities yet.",
    identitiesLastSignedIn: "Last signed in {time}",
    identitiesClear: "Clear identity",
    identitiesClearing: "Clearing…",
    identitiesCleared: "The identity was cleared.",
    identitiesClearTitle: "Clear this identity?",
    identitiesClearCopy: "The kept browser fingerprint and profile of “{name}” are deleted. The next sign-in for that account draws a new fingerprint.",
    identitiesClearConfirm: "Clear identity",
    identitiesError: "The identities could not be loaded.",
    identitiesLoading: "Reading the kept identities…",
    identitiesRetry: "Retry",
    environmentTitle: "Login browser setup",
    environmentCopy: "Clean Login needs a one-time isolated browser so sign-in pages never open in your everyday browser. Nothing is downloaded until you choose Prepare.",
    environmentSizeLabel: "Download",
    environmentSizeValue: "{size} download · about {extracted} on disk",
    environmentDiskLabel: "Free disk space",
    environmentDiskValue: "{free} free · {required} needed",
    environmentLocationLabel: "Install location",
    environmentNote: "The browser files stay inside this plugin's own cache, never your shared Camoufox cache.",
    environmentChecksumVerified: "The download is verified against the published sha256.",
    environmentChecksumUnverified: "The download is not checksum-verified because a custom browser URL was set without a sha256.",
    environmentBadgeMissing: "Not installed",
    environmentBadgeReady: "Ready",
    environmentBadgePreparing: "Preparing…",
    environmentBadgeError: "Setup failed",
    environmentBadgeCancelled: "Cancelled",
    environmentProgress: "{percent}% · {received} of {total}",
    environmentPrepare: "Prepare browser",
    environmentCancel: "Cancel",
    environmentRetry: "Retry",
    errorInsufficientDisk: "Not enough free disk space to install the login browser.",
    errorInstallerUnavailable: "The browser runtime is not available in this installation.",
    errorDownloadFailed: "The browser download failed.",
    errorRateLimited: "GitHub rate-limited the download. Set GITHUB_TOKEN or the browser URL override, then retry.",
    errorExtractFailed: "The browser archive could not be unpacked.",
    errorEnvironmentUnknown: "The browser setup failed.",
    proxiesTitle: "Proxy IPs",
    proxiesCopy: "Each account signs in and makes requests through the proxy you choose.",
    proxiesEmptyTitle: "No proxy IPs yet",
    proxiesEmptyCopy: "Add a proxy to give providers a clean exit.",
    addProxy: "Add Proxy",
    connecting: "Connecting…",
    ready: "Local service connected",
    failed: "Local service unavailable",
    retry: "Retry",
    name: "Name",
    type: "Type",
    host: "Host",
    port: "Port",
    username: "Username",
    password: "Password",
    optional: "(optional)",
    addProxyTitle: "Add Proxy IP",
    editProxyTitle: "Edit Proxy IP",
    proxyDialogCopy: "HTTP, HTTPS and SOCKS5 are supported. Passwords are stored locally and never shown again.",
    namePlaceholder: "Singapore · 01",
    hostPlaceholder: "127.0.0.1",
    portPlaceholder: "1080",
    passwordKeepHint: "The password is saved. Leave this blank to keep it.",
    testConnection: "Test connection",
    testing: "Testing…",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    close: "Close",
    statusUntested: "Never tested",
    statusTesting: "Testing…",
    statusOk: "Available",
    statusError: "Failed",
    never: "Never",
    unknown: "Unknown",
    lastChecked: "Last checked",
    exitIp: "Exit IP",
    colName: "Name",
    colAddress: "Address",
    colRegion: "Region",
    colStatus: "Status",
    colChecked: "Last checked",
    colScore: "Score",
    scoreAction: "Score",
    scoring: "Scoring…",
    scoreFailed: "Score failed",
    scoreBusy: "A score is already in progress.",
    scoreStateLaunching: "Opening the browser…",
    scoreStateMeasuring: "Reading the Trust Score…",
    scoreStateDone: "Score saved.",
    scoreStateError: "Score failed",
    scoreStateCancelled: "Scoring cancelled.",
    scoreCancel: "Close window",
    filterRegionLabel: "Region",
    filterAllRegions: "All",
    filterLatencyLabel: "Latency (ms)",
    filterLatencyMin: "Min",
    filterLatencyMax: "Max",
    filterReset: "Reset",
    filterCount: "Showing {shown} / {total}",
    filterNoMatch: "No proxies match these filters.",
    regionUntested: "Untested",
    test: "Test",
    edit: "Edit",
    delete: "Delete",
    deleteTitle: "Delete proxy IP?",
    deleteCopy: "Remove “{name}” from the proxy list? This cannot be undone.",
    deleteConfirm: "Delete",
    testSuccess: "Connection works · exit {ip} · {region} · {latency} ms",
    testFailure: "Connection failed · {error}",
    nameRequired: "Enter a name.",
    nameInvalid: "The name contains unsupported characters.",
    nameTooLong: "The name is too long.",
    typeInvalid: "Choose HTTP, HTTPS or SOCKS5.",
    hostRequired: "Enter a host.",
    hostInvalid: "Enter a host without spaces or control characters.",
    hostTooLong: "The host is too long.",
    portInvalid: "The port must be between 1 and 65535.",
    usernameInvalid: "The username contains unsupported characters.",
    usernameTooLong: "The username is too long.",
    passwordInvalid: "The password contains unsupported characters.",
    passwordTooLong: "The password is too long.",
    errorInvalidName: "Enter a name.",
    errorInvalidType: "Choose HTTP, HTTPS or SOCKS5.",
    errorInvalidHost: "Enter a valid host.",
    errorInvalidPort: "The port must be between 1 and 65535.",
    errorInvalidUsername: "The username is not valid.",
    errorInvalidPassword: "The password is not valid.",
    errorNotFound: "This proxy no longer exists.",
    errorInvalidJson: "The request was not valid JSON.",
    errorTooLarge: "The request was too large.",
    errorUnauthorized: "The local service token is no longer valid. Reload the page.",
    errorForbidden: "The local service refused the request.",
    errorInternal: "The local service could not complete this request.",
    errorAccountNotFound: "This identity no longer exists.",
    errorAccountSignedIn: "This account is still signed in. Sign it out in magpie first.",
    errorAccountAuthUnreadable: "The signed-in accounts could not be read, so nothing was changed.",
    errorAccountInvalid: "This identity reference is not valid.",
    errorAccountRetiredMissing: "This identity no longer exists for the provider.",
    errorAccountMismatch: "The sign-in returned a different account than the chosen identity, so nothing was written.",
    errorNetwork: "The local service could not be reached.",
    errorGeneric: "The request failed.",
    testTimeout: "Connection timed out.",
    testRefused: "The proxy refused the connection.",
    testDns: "The proxy host could not be resolved.",
    testReset: "The proxy closed the connection.",
    testProxyAuth: "Proxy authentication failed.",
    testTunnel: "The proxy refused the tunnel.",
    testEndpointHttp: "The test endpoint returned an HTTP error.",
    testEndpointJson: "The test endpoint did not return usable JSON.",
    testTls: "Secure connection to the test endpoint failed.",
    testSocksAuth: "SOCKS5 authentication failed.",
    testSocksRefused: "The SOCKS5 proxy refused the connection.",
    testSocksHost: "The SOCKS5 proxy could not reach the test endpoint.",
    testSocksGeneral: "The SOCKS5 proxy could not connect.",
    testUnknown: "Could not reach the test endpoint through this proxy.",
  },
  "zh-Hans": {
    title: "干净登录",
    subtitle: "管理代理 IP 与供应商登录。",
    providers: "供应商",
    proxies: "代理 IP",
    providersTitle: "供应商",
    providersCopy: "受支持的供应商及其当前的登录就绪状态。",
    providersEmptyTitle: "还没有供应商",
    providersEmptyCopy: "本地服务就绪后，支持的供应商会显示在这里。",
    providerPending: "等待验证",
    providerReady: "就绪",
    providerBlocked: "已阻止",
    providersSourceMagpie: "名单来自 magpie",
    providersSourceLocal: "未取得 magpie 名单 · 使用本地名单",
    providersDiff: "两边都有 {both} · 仅本地 {localOnly} · 仅 magpie {magpieOnly}",
    providersDiffNone: "本地名单与 magpie 一致。",
    providersDiffUnavailable: "无法读取 magpie 的供应商名单，因此无法显示差异。",
    providerMethodsHeading: "已安装插件中找到的登录方式",
    providerMethodBrowserTag: "浏览器",
    providerMethodDeviceTag: "设备码",
    providerMethodFormTag: "需要填表",
    providerMethodLocalTag: "本地登录态",
    providerMethodKeyTag: "密钥",
    providerMethodSecretTag: "粘贴密钥",
    providerMethodPendingTag: "方式待确认",
    providerMethodUnknownTag: "方式待确认",
    providerMethodNote: "登录方式在开始登录时才会确认，以实际打开的页面为准。",
    providerSourceLineHeading: "名单来源",
    providerSourceLocal: "本地注册表",
    providerSourceMagpie: "magpie 名单",
    providerSourcePlugins: "已安装插件",
    providerPluginsFound: "已安装供应商条目 {count} 个 · {browser} 个需要浏览器",
    providerPluginsScanning: "正在扫描已安装插件…",
    providerPluginsUnavailable: "无法扫描已安装插件",
    addAccount: "添加账号",
    signInTitle: "添加账号",
    signInCopy: "这会打开一个隔离浏览器窗口。请在窗口里完成登录，干净登录会把生成的凭据写入 magpie。",
    signInUnverified: "该流程还没有在干净登录中验证过。你可以直接尝试，失败会如实报错，也欢迎反馈问题。",
    signInProxyLabel: "代理 IP",
    signInProxyDirect: "不使用代理（直连）",
    signInMethodLabel: "登录方式",
    signInMethodHint: "该供应商提供了多个登录方式，请选择你要用的那一个；选错会登录到错误的站点。",
    signInStart: "开始登录",
    signInStarting: "正在开始…",
    signInOpened: "已在隔离浏览器窗口打开登录页，请在那个窗口里完成登录。",
    signInCancel: "取消登录",
    signInClose: "关闭",
    signInStateAuthorizing: "正在获取登录地址…",
    signInStateWaiting: "等待你在浏览器窗口中完成登录…",
    signInStateFinishing: "正在把凭据写入 magpie…",
    signInStateDone: "已完成",
    signInStateError: "失败",
    signInStateCancelled: "已取消",
    signInAccountKey: "账号键",
    signInAccountLabel: "沿用已有身份继续登录",
    signInAccountHint: "该身份保留自己的浏览器指纹。沿用时会重用该指纹，而不是重新生成。",
    signInAccountNew: "新账号（新的指纹）",
    signInDone: "登录完成，凭据已写入 magpie。",
    signInCancelled: "登录已取消。",
    signInBusy: "已有登录正在进行。",
    identitiesTitle: "账号身份",
    identitiesCopy: "每个账号都有自己的浏览器指纹。已登出的身份会被保留，因此再次登录时会重用同一个指纹，而不是重新生成。",
    identitiesEmpty: "目前没有已登出的身份。",
    identitiesLastSignedIn: "上次登录于 {time}",
    identitiesClear: "清除身份",
    identitiesClearing: "清除中…",
    identitiesCleared: "身份已清除。",
    identitiesClearTitle: "清除这个身份？",
    identitiesClearCopy: "“{name}”保留的浏览器指纹与配置目录会被删除。该账号下次登录时会生成新的指纹。",
    identitiesClearConfirm: "清除身份",
    identitiesError: "无法加载身份列表。",
    identitiesLoading: "正在读取保留的身份…",
    identitiesRetry: "重试",
    environmentTitle: "登录浏览器设置",
    environmentCopy: "干净登录需要一次性准备一个隔离浏览器，登录页面不会出现在日常浏览器中。只有点击“准备”后才会开始下载。",
    environmentSizeLabel: "下载大小",
    environmentSizeValue: "下载 {size} · 磁盘占用约 {extracted}",
    environmentDiskLabel: "可用磁盘空间",
    environmentDiskValue: "可用 {free} · 需要 {required}",
    environmentLocationLabel: "安装位置",
    environmentNote: "浏览器文件保存在本插件自己的缓存中，不会写入你共享的 Camoufox 缓存。",
    environmentChecksumVerified: "下载已按公布的 sha256 校验。",
    environmentChecksumUnverified: "已覆盖浏览器 URL 且未提供 sha256，因此下载未做校验。",
    environmentBadgeMissing: "未安装",
    environmentBadgeReady: "已就绪",
    environmentBadgePreparing: "正在准备…",
    environmentBadgeError: "设置失败",
    environmentBadgeCancelled: "已取消",
    environmentProgress: "{percent}% · {received} / {total}",
    environmentPrepare: "准备浏览器",
    environmentCancel: "取消",
    environmentRetry: "重试",
    errorInsufficientDisk: "磁盘可用空间不足，无法安装登录浏览器。",
    errorInstallerUnavailable: "此安装中缺少浏览器运行时。",
    errorDownloadFailed: "浏览器下载失败。",
    errorRateLimited: "GitHub 对下载进行了限流。请设置 GITHUB_TOKEN 或浏览器 URL 覆盖后重试。",
    errorExtractFailed: "无法解压浏览器压缩包。",
    errorEnvironmentUnknown: "浏览器设置失败。",
    proxiesTitle: "代理 IP",
    proxiesCopy: "账号通过你选择的代理完成登录和后续请求。",
    proxiesEmptyTitle: "还没有代理 IP",
    proxiesEmptyCopy: "添加代理，为供应商提供干净的出口。",
    addProxy: "添加代理",
    connecting: "正在连接…",
    ready: "本地服务已连接",
    failed: "本地服务不可用",
    retry: "重试",
    name: "名称",
    type: "类型",
    host: "地址",
    port: "端口",
    username: "用户名",
    password: "密码",
    optional: "（可选）",
    addProxyTitle: "添加代理 IP",
    editProxyTitle: "编辑代理 IP",
    proxyDialogCopy: "支持 HTTP、HTTPS 和 SOCKS5。密码只保存在本机，之后不会再显示。",
    namePlaceholder: "新加坡 · 01",
    hostPlaceholder: "127.0.0.1",
    portPlaceholder: "1080",
    passwordKeepHint: "已保存密码。留空表示保持不变。",
    testConnection: "测试连接",
    testing: "正在测试…",
    save: "保存",
    saving: "正在保存…",
    cancel: "取消",
    close: "关闭",
    statusUntested: "未检测",
    statusTesting: "正在测试…",
    statusOk: "可用",
    statusError: "失败",
    never: "从未",
    unknown: "未知",
    lastChecked: "上次检测",
    exitIp: "出口 IP",
    colName: "名称",
    colAddress: "地址",
    colRegion: "地区",
    colStatus: "状态",
    colChecked: "上次检测",
    colScore: "评分",
    scoreAction: "评分",
    scoring: "评分中…",
    scoreFailed: "评分失败",
    scoreBusy: "已在评分中。",
    scoreStateLaunching: "正在打开浏览器…",
    scoreStateMeasuring: "正在读取 Trust Score…",
    scoreStateDone: "评分已保存。",
    scoreStateError: "评分失败",
    scoreStateCancelled: "评分已取消。",
    scoreCancel: "关闭窗口",
    filterRegionLabel: "地区",
    filterAllRegions: "全部",
    filterLatencyLabel: "延迟（毫秒）",
    filterLatencyMin: "最小",
    filterLatencyMax: "最大",
    filterReset: "重置",
    filterCount: "已筛选 {shown} / 共 {total}",
    filterNoMatch: "没有符合筛选条件的代理。",
    regionUntested: "未测试",
    test: "测试",
    edit: "编辑",
    delete: "删除",
    deleteTitle: "删除代理 IP？",
    deleteCopy: "“{name}”将从代理列表中移除，此操作无法撤销。",
    deleteConfirm: "删除",
    testSuccess: "连接正常 · 出口 {ip} · {region} · {latency} ms",
    testFailure: "连接失败 · {error}",
    nameRequired: "请输入名称。",
    nameInvalid: "名称包含不支持的字符。",
    nameTooLong: "名称过长。",
    typeInvalid: "请选择 HTTP、HTTPS 或 SOCKS5。",
    hostRequired: "请输入地址。",
    hostInvalid: "地址不能包含空格或控制字符。",
    hostTooLong: "地址过长。",
    portInvalid: "端口应在 1 到 65535 之间。",
    usernameInvalid: "用户名包含不支持的字符。",
    usernameTooLong: "用户名过长。",
    passwordInvalid: "密码包含不支持的字符。",
    passwordTooLong: "密码过长。",
    errorInvalidName: "请输入名称。",
    errorInvalidType: "请选择 HTTP、HTTPS 或 SOCKS5。",
    errorInvalidHost: "请输入有效的地址。",
    errorInvalidPort: "端口应在 1 到 65535 之间。",
    errorInvalidUsername: "用户名无效。",
    errorInvalidPassword: "密码无效。",
    errorNotFound: "这个代理已不存在。",
    errorInvalidJson: "请求不是有效的 JSON。",
    errorTooLarge: "请求内容过大。",
    errorUnauthorized: "本地服务令牌已失效，请重新加载页面。",
    errorForbidden: "本地服务拒绝了请求。",
    errorInternal: "本地服务无法完成这个请求。",
    errorAccountNotFound: "这个身份已不存在。",
    errorAccountSignedIn: "该账号仍处于登录状态，请先在 magpie 中登出。",
    errorAccountAuthUnreadable: "无法读取已登录的账号，因此没有做任何更改。",
    errorAccountInvalid: "身份引用无效。",
    errorAccountRetiredMissing: "该供应商下已没有这个身份。",
    errorAccountMismatch: "登录返回的账号与所选身份不一致，因此没有写入任何凭据。",
    errorNetwork: "无法连接本地服务。",
    errorGeneric: "请求失败。",
    testTimeout: "连接超时。",
    testRefused: "代理拒绝了连接。",
    testDns: "无法解析代理地址。",
    testReset: "代理关闭了连接。",
    testProxyAuth: "代理认证失败。",
    testTunnel: "代理拒绝了隧道连接。",
    testEndpointHttp: "检测地址返回了 HTTP 错误。",
    testEndpointJson: "检测地址没有返回可用的 JSON。",
    testTls: "无法与检测地址建立安全连接。",
    testSocksAuth: "SOCKS5 认证失败。",
    testSocksRefused: "SOCKS5 代理拒绝了连接。",
    testSocksHost: "SOCKS5 代理无法访问检测地址。",
    testSocksGeneral: "SOCKS5 代理无法连接。",
    testUnknown: "无法通过这个代理访问检测地址。",
  },
  "zh-Hant": {
    title: "乾淨登入",
    subtitle: "管理代理 IP 與供應商登入。",
    providers: "供應商",
    proxies: "代理 IP",
    providersTitle: "供應商",
    providersCopy: "支援的供應商及其目前的登入就緒狀態。",
    providersEmptyTitle: "還沒有供應商",
    providersEmptyCopy: "本機服務就緒後，支援的供應商會顯示在這裡。",
    providerPending: "等待驗證",
    providerReady: "就緒",
    providerBlocked: "已封鎖",
    providersSourceMagpie: "名單來自 magpie",
    providersSourceLocal: "未取得 magpie 名單 · 使用本機名單",
    providersDiff: "兩邊都有 {both} · 僅本機 {localOnly} · 僅 magpie {magpieOnly}",
    providersDiffNone: "本機名單與 magpie 一致。",
    providersDiffUnavailable: "無法讀取 magpie 的供應商名單，因此無法顯示差異。",
    providerMethodsHeading: "已安裝外掛中找到的登入方式",
    providerMethodBrowserTag: "瀏覽器",
    providerMethodDeviceTag: "設備碼",
    providerMethodFormTag: "需要填表",
    providerMethodLocalTag: "本機登入狀態",
    providerMethodKeyTag: "金鑰",
    providerMethodSecretTag: "貼上密鑰",
    providerMethodPendingTag: "方式待確認",
    providerMethodUnknownTag: "方式待確認",
    providerMethodNote: "登入方式在開始登入時才會確認，以實際開啟的頁面為準。",
    providerSourceLineHeading: "名單來源",
    providerSourceLocal: "本機登錄檔",
    providerSourceMagpie: "magpie 名單",
    providerSourcePlugins: "已安裝外掛",
    providerPluginsFound: "已安裝供應商項目 {count} 個 · {browser} 個需要瀏覽器",
    providerPluginsScanning: "正在掃描已安裝外掛…",
    providerPluginsUnavailable: "無法掃描已安裝外掛",
    addAccount: "新增帳號",
    signInTitle: "新增帳號",
    signInCopy: "這會開啟一個隔離瀏覽器視窗。請在視窗裡完成登入，乾淨登入會把產生的憑證寫入 magpie。",
    signInUnverified: "此流程尚未在乾淨登入中驗證過。你可以直接嘗試，失敗會如實回報，也歡迎回報問題。",
    signInProxyLabel: "代理 IP",
    signInProxyDirect: "不使用代理（直連）",
    signInMethodLabel: "登入方式",
    signInMethodHint: "該供應商提供了多個登入方式，請選擇你要用的那一個；選錯會登入到錯誤的站點。",
    signInStart: "開始登入",
    signInStarting: "正在開始…",
    signInOpened: "已在隔離瀏覽器視窗開啟登入頁，請在那個視窗裡完成登入。",
    signInCancel: "取消登入",
    signInClose: "關閉",
    signInStateAuthorizing: "正在取得登入網址…",
    signInStateWaiting: "等待你在瀏覽器視窗中完成登入…",
    signInStateFinishing: "正在把憑證寫入 magpie…",
    signInStateDone: "已完成",
    signInStateError: "失敗",
    signInStateCancelled: "已取消",
    signInAccountKey: "帳號金鑰",
    signInAccountLabel: "沿用現有身分繼續登入",
    signInAccountHint: "這個身分保留自己的瀏覽器指紋。沿用時會重用該指紋，而不是重新產生。",
    signInAccountNew: "新帳號（新的指紋）",
    signInDone: "登入完成，憑證已寫入 magpie。",
    signInCancelled: "登入已取消。",
    signInBusy: "已有登入正在進行。",
    identitiesTitle: "帳號身分",
    identitiesCopy: "每個帳號都有自己的瀏覽器指紋。已登出的身分會被保留，因此再次登入時會重用同一個指紋，而不是重新產生。",
    identitiesEmpty: "目前沒有已登出的身分。",
    identitiesLastSignedIn: "上次登入於 {time}",
    identitiesClear: "清除身分",
    identitiesClearing: "清除中…",
    identitiesCleared: "身分已清除。",
    identitiesClearTitle: "清除這個身分？",
    identitiesClearCopy: "「{name}」保留的瀏覽器指紋與設定檔會被刪除。該帳號下次登入時會產生新的指紋。",
    identitiesClearConfirm: "清除身分",
    identitiesError: "無法載入身分列表。",
    identitiesLoading: "正在讀取保留的身分…",
    identitiesRetry: "重試",
    environmentTitle: "登入瀏覽器設定",
    environmentCopy: "乾淨登入需要一次性準備一個隔離瀏覽器，登入頁面不會出現在日常瀏覽器中。只有點擊「準備」後才會開始下載。",
    environmentSizeLabel: "下載大小",
    environmentSizeValue: "下載 {size} · 磁碟佔用約 {extracted}",
    environmentDiskLabel: "可用磁碟空間",
    environmentDiskValue: "可用 {free} · 需要 {required}",
    environmentLocationLabel: "安裝位置",
    environmentNote: "瀏覽器檔案保存在本外掛自己的快取中，不會寫入你共用的 Camoufox 快取。",
    environmentChecksumVerified: "下載已按發佈的 sha256 校驗。",
    environmentChecksumUnverified: "已覆寫瀏覽器 URL 且未提供 sha256，因此下載未做校驗。",
    environmentBadgeMissing: "未安裝",
    environmentBadgeReady: "已就緒",
    environmentBadgePreparing: "正在準備…",
    environmentBadgeError: "設定失敗",
    environmentBadgeCancelled: "已取消",
    environmentProgress: "{percent}% · {received} / {total}",
    environmentPrepare: "準備瀏覽器",
    environmentCancel: "取消",
    environmentRetry: "重試",
    errorInsufficientDisk: "磁碟可用空間不足，無法安裝登入瀏覽器。",
    errorInstallerUnavailable: "此安裝中缺少瀏覽器執行環境。",
    errorDownloadFailed: "瀏覽器下載失敗。",
    errorRateLimited: "GitHub 對下載進行了限流。請設定 GITHUB_TOKEN 或瀏覽器 URL 覆寫後重試。",
    errorExtractFailed: "無法解壓縮瀏覽器壓縮檔。",
    errorEnvironmentUnknown: "瀏覽器設定失敗。",
    proxiesTitle: "代理 IP",
    proxiesCopy: "帳號透過你選擇的代理完成登入和後續請求。",
    proxiesEmptyTitle: "還沒有代理 IP",
    proxiesEmptyCopy: "新增代理，為供應商提供乾淨的出口。",
    addProxy: "新增代理",
    connecting: "正在連線…",
    ready: "本機服務已連線",
    failed: "本機服務無法使用",
    retry: "重試",
    name: "名稱",
    type: "類型",
    host: "位址",
    port: "連接埠",
    username: "使用者名稱",
    password: "密碼",
    optional: "（選填）",
    addProxyTitle: "新增代理 IP",
    editProxyTitle: "編輯代理 IP",
    proxyDialogCopy: "支援 HTTP、HTTPS 和 SOCKS5。密碼只保存在本機，之後不會再顯示。",
    namePlaceholder: "新加坡 · 01",
    hostPlaceholder: "127.0.0.1",
    portPlaceholder: "1080",
    passwordKeepHint: "已儲存密碼。留空表示維持不變。",
    testConnection: "測試連線",
    testing: "正在測試…",
    save: "儲存",
    saving: "正在儲存…",
    cancel: "取消",
    close: "關閉",
    statusUntested: "未檢測",
    statusTesting: "正在測試…",
    statusOk: "可用",
    statusError: "失敗",
    never: "從未",
    unknown: "未知",
    lastChecked: "上次檢測",
    exitIp: "出口 IP",
    colName: "名稱",
    colAddress: "位址",
    colRegion: "地區",
    colStatus: "狀態",
    colChecked: "上次檢測",
    colScore: "評分",
    scoreAction: "評分",
    scoring: "評分中…",
    scoreFailed: "評分失敗",
    scoreBusy: "已在評分中。",
    scoreStateLaunching: "正在開啟瀏覽器…",
    scoreStateMeasuring: "正在讀取 Trust Score…",
    scoreStateDone: "評分已儲存。",
    scoreStateError: "評分失敗",
    scoreStateCancelled: "評分已取消。",
    scoreCancel: "關閉視窗",
    filterRegionLabel: "地區",
    filterAllRegions: "全部",
    filterLatencyLabel: "延遲（毫秒）",
    filterLatencyMin: "最小",
    filterLatencyMax: "最大",
    filterReset: "重設",
    filterCount: "已篩選 {shown} / 共 {total}",
    filterNoMatch: "沒有符合篩選條件的代理。",
    regionUntested: "未檢測",
    test: "測試",
    edit: "編輯",
    delete: "刪除",
    deleteTitle: "刪除代理 IP？",
    deleteCopy: "「{name}」將從代理清單中移除，此操作無法復原。",
    deleteConfirm: "刪除",
    testSuccess: "連線正常 · 出口 {ip} · {region} · {latency} ms",
    testFailure: "連線失敗 · {error}",
    nameRequired: "請輸入名稱。",
    nameInvalid: "名稱包含不支援的字元。",
    nameTooLong: "名稱過長。",
    typeInvalid: "請選擇 HTTP、HTTPS 或 SOCKS5。",
    hostRequired: "請輸入位址。",
    hostInvalid: "位址不能包含空格或控制字元。",
    hostTooLong: "位址過長。",
    portInvalid: "連接埠應在 1 到 65535 之間。",
    usernameInvalid: "使用者名稱包含不支援的字元。",
    usernameTooLong: "使用者名稱過長。",
    passwordInvalid: "密碼包含不支援的字元。",
    passwordTooLong: "密碼過長。",
    errorInvalidName: "請輸入名稱。",
    errorInvalidType: "請選擇 HTTP、HTTPS 或 SOCKS5。",
    errorInvalidHost: "請輸入有效的位址。",
    errorInvalidPort: "連接埠應在 1 到 65535 之間。",
    errorInvalidUsername: "使用者名稱無效。",
    errorInvalidPassword: "密碼無效。",
    errorNotFound: "這個代理已不存在。",
    errorInvalidJson: "請求不是有效的 JSON。",
    errorTooLarge: "請求內容過大。",
    errorUnauthorized: "本機服務權杖已失效，請重新載入頁面。",
    errorForbidden: "本機服務拒絕了請求。",
    errorInternal: "本機服務無法完成這個請求。",
    errorAccountNotFound: "這個身分已不存在。",
    errorAccountSignedIn: "該帳號仍處於登入狀態，請先在 magpie 中登出。",
    errorAccountAuthUnreadable: "無法讀取已登入的帳號，因此沒有做任何變更。",
    errorAccountInvalid: "身分參照無效。",
    errorAccountRetiredMissing: "該供應商下已沒有這個身分。",
    errorAccountMismatch: "登入傳回的帳號與所選身分不一致，因此沒有寫入任何憑證。",
    errorNetwork: "無法連線本機服務。",
    errorGeneric: "請求失敗。",
    testTimeout: "連線逾時。",
    testRefused: "代理拒絕了連線。",
    testDns: "無法解析代理位址。",
    testReset: "代理關閉了連線。",
    testProxyAuth: "代理認證失敗。",
    testTunnel: "代理拒絕了通道連線。",
    testEndpointHttp: "檢測位址傳回了 HTTP 錯誤。",
    testEndpointJson: "檢測位址沒有傳回可用的 JSON。",
    testTls: "無法與檢測位址建立安全連線。",
    testSocksAuth: "SOCKS5 認證失敗。",
    testSocksRefused: "SOCKS5 代理拒絕了連線。",
    testSocksHost: "SOCKS5 代理無法存取檢測位址。",
    testSocksGeneral: "SOCKS5 代理無法連線。",
    testUnknown: "無法透過這個代理存取檢測位址。",
  },
  ja: {
    title: "クリーンログイン",
    subtitle: "プロキシ IP とプロバイダーのログインを管理します。",
    providers: "プロバイダー",
    proxies: "プロキシ IP",
    providersTitle: "プロバイダー",
    providersCopy: "対応プロバイダーと現在のログイン準備状況です。",
    providersEmptyTitle: "プロバイダーがありません",
    providersEmptyCopy: "ローカルサービスが準備できると、対応プロバイダーがここに表示されます。",
    providerPending: "検証待ち",
    providerReady: "準備完了",
    providerBlocked: "ブロック中",
    providersSourceMagpie: "magpie から取得した一覧",
    providersSourceLocal: "magpie の一覧を取得できず · ローカル一覧を使用",
    providersDiff: "両方 {both} · ローカルのみ {localOnly} · magpie のみ {magpieOnly}",
    providersDiffNone: "ローカル一覧は magpie と一致しています。",
    providersDiffUnavailable: "magpie のプロバイダー一覧を読み取れなかったため、差分を表示できません。",
    providerMethodsHeading: "インストール済みプラグインで見つかったログイン方法",
    providerMethodBrowserTag: "ブラウザー",
    providerMethodDeviceTag: "デバイスコード",
    providerMethodFormTag: "入力が必要",
    providerMethodLocalTag: "ローカルセッション",
    providerMethodKeyTag: "キー",
    providerMethodSecretTag: "トークンを貼り付け",
    providerMethodPendingTag: "確認待ち",
    providerMethodUnknownTag: "確認待ち",
    providerMethodNote: "ログイン方法は実際に開始してから確定します。開いたページが正です。",
    providerSourceLineHeading: "一覧の出所",
    providerSourceLocal: "ローカル登録",
    providerSourceMagpie: "magpie の一覧",
    providerSourcePlugins: "インストール済みプラグイン",
    providerPluginsFound: "インストール済みプロバイダー {count} 件 · ブラウザーが必要 {browser} 件",
    providerPluginsScanning: "インストール済みプラグインをスキャン中…",
    providerPluginsUnavailable: "インストール済みプラグインをスキャンできません",
    addAccount: "アカウントを追加",
    signInTitle: "アカウントを追加",
    signInCopy: "隔離されたブラウザーウィンドウを開きます。そこでログインすると、クリーンログインが得られた認証情報を magpie に書き込みます。",
    signInUnverified: "このフローはクリーンログインではまだ検証されていません。そのまま試せます。失敗はそのまま表示され、問題の報告も歓迎します。",
    signInProxyLabel: "プロキシ IP",
    signInProxyDirect: "プロキシを使用しない（直接接続）",
    signInMethodLabel: "ログイン方法",
    signInMethodHint: "このプロバイダーには複数のログイン方法があります。使うものを選んでください。選び違うと別のサイトへログインしてしまいます。",
    signInStart: "ログインを開始",
    signInStarting: "開始しています…",
    signInOpened: "隔離されたブラウザーウィンドウでログインページを開きました。そのウィンドウでログインを完了してください。",
    signInCancel: "ログインをキャンセル",
    signInClose: "閉じる",
    signInStateAuthorizing: "認可を取得しています…",
    signInStateWaiting: "ブラウザーでのログイン完了を待っています…",
    signInStateFinishing: "認証情報を magpie に書き込んでいます…",
    signInStateDone: "完了",
    signInStateError: "失敗",
    signInStateCancelled: "キャンセル済み",
    signInAccountKey: "アカウントキー",
    signInAccountLabel: "既存のIDでログインを継続",
    signInAccountHint: "このIDは独自のブラウザ指紋を保持します。継続すると新しい指紋ではなく同じ指紋が使われます。",
    signInAccountNew: "新しいアカウント（新しい指紋）",
    signInDone: "ログインが完了し、認証情報を magpie に書き込みました。",
    signInCancelled: "ログインをキャンセルしました。",
    signInBusy: "すでにログインが進行中です。",
    identitiesTitle: "アカウントID",
    identitiesCopy: "各アカウントは独自のブラウザ指紋を持ちます。ログアウトしたIDは保持されるため、次にログインしても同じ指紋が使われ、新しい指紋が生成されることはありません。",
    identitiesEmpty: "ログアウトしたIDはまだありません。",
    identitiesLastSignedIn: "最終ログイン {time}",
    identitiesClear: "IDを消去",
    identitiesClearing: "消去中…",
    identitiesCleared: "IDを消去しました。",
    identitiesClearTitle: "このIDを消去しますか？",
    identitiesClearCopy: "「{name}」の保持されているブラウザ指紋とプロファイルを削除します。次回のログインでは新しい指紋が生成されます。",
    identitiesClearConfirm: "IDを消去",
    identitiesError: "ID一覧を読み込めませんでした。",
    identitiesLoading: "保持されているIDを読み込み中…",
    identitiesRetry: "再試行",
    environmentTitle: "ログイン用ブラウザーの準備",
    environmentCopy: "クリーンログインは、ログインページが普段のブラウザーに残らないよう、一度だけ隔離されたブラウザーを準備します。「準備」を選ぶまでダウンロードは始まりません。",
    environmentSizeLabel: "ダウンロード",
    environmentSizeValue: "ダウンロード {size} · ディスク約 {extracted}",
    environmentDiskLabel: "空きディスク容量",
    environmentDiskValue: "空き {free} · 必要 {required}",
    environmentLocationLabel: "インストール先",
    environmentNote: "ブラウザーのファイルはこのプラグイン専用のキャッシュに保存され、共有の Camoufox キャッシュには書き込みません。",
    environmentChecksumVerified: "ダウンロードは公開された sha256 で検証済みです。",
    environmentChecksumUnverified: "ブラウザー URL を上書きし sha256 を指定していないため、ダウンロードは検証されません。",
    environmentBadgeMissing: "未インストール",
    environmentBadgeReady: "準備完了",
    environmentBadgePreparing: "準備中…",
    environmentBadgeError: "セットアップ失敗",
    environmentBadgeCancelled: "キャンセル済み",
    environmentProgress: "{percent}% · {received} / {total}",
    environmentPrepare: "ブラウザーを準備",
    environmentCancel: "キャンセル",
    environmentRetry: "再試行",
    errorInsufficientDisk: "ログイン用ブラウザーをインストールする空きディスク容量が不足しています。",
    errorInstallerUnavailable: "このインストールにはブラウザーランタイムがありません。",
    errorDownloadFailed: "ブラウザーのダウンロードに失敗しました。",
    errorRateLimited: "GitHub がダウンロードをレート制限しました。GITHUB_TOKEN またはブラウザー URL の上書きを設定して再試行してください。",
    errorExtractFailed: "ブラウザーのアーカイブを展開できませんでした。",
    errorEnvironmentUnknown: "ブラウザーのセットアップに失敗しました。",
    proxiesTitle: "プロキシ IP",
    proxiesCopy: "アカウントは選択したプロキシ経由でログインし、リクエストを送ります。",
    proxiesEmptyTitle: "プロキシ IP がありません",
    proxiesEmptyCopy: "プロキシを追加して、プロバイダーにクリーンな出口を用意します。",
    addProxy: "プロキシを追加",
    connecting: "接続中…",
    ready: "ローカルサービスに接続しました",
    failed: "ローカルサービスを利用できません",
    retry: "再読み込み",
    name: "名前",
    type: "種類",
    host: "ホスト",
    port: "ポート",
    username: "ユーザー名",
    password: "パスワード",
    optional: "（任意）",
    addProxyTitle: "プロキシ IP を追加",
    editProxyTitle: "プロキシ IP を編集",
    proxyDialogCopy: "HTTP、HTTPS、SOCKS5 に対応しています。パスワードはローカルに保存され、再表示されません。",
    namePlaceholder: "シンガポール · 01",
    hostPlaceholder: "127.0.0.1",
    portPlaceholder: "1080",
    passwordKeepHint: "パスワードは保存済みです。空欄のままにすると変更しません。",
    testConnection: "接続テスト",
    testing: "テスト中…",
    save: "保存",
    saving: "保存中…",
    cancel: "キャンセル",
    close: "閉じる",
    statusUntested: "未テスト",
    statusTesting: "テスト中…",
    statusOk: "利用可能",
    statusError: "失敗",
    never: "なし",
    unknown: "不明",
    lastChecked: "最終テスト",
    exitIp: "出口 IP",
    colName: "名前",
    colAddress: "アドレス",
    colRegion: "地域",
    colStatus: "状態",
    colChecked: "最終テスト",
    colScore: "スコア",
    scoreAction: "スコア測定",
    scoring: "測定中…",
    scoreFailed: "スコア測定失敗",
    scoreBusy: "すでにスコア測定中です。",
    scoreStateLaunching: "ブラウザーを開いています…",
    scoreStateMeasuring: "Trust Score を読み取っています…",
    scoreStateDone: "スコアを保存しました。",
    scoreStateError: "スコア測定失敗",
    scoreStateCancelled: "スコア測定をキャンセルしました。",
    scoreCancel: "ウィンドウを閉じる",
    filterRegionLabel: "地域",
    filterAllRegions: "すべて",
    filterLatencyLabel: "レイテンシ（ミリ秒）",
    filterLatencyMin: "最小",
    filterLatencyMax: "最大",
    filterReset: "リセット",
    filterCount: "表示 {shown} / {total}",
    filterNoMatch: "条件に一致するプロキシがありません。",
    regionUntested: "未テスト",
    test: "テスト",
    edit: "編集",
    delete: "削除",
    deleteTitle: "プロキシ IP を削除しますか？",
    deleteCopy: "「{name}」をプロキシ一覧から削除します。元に戻せません。",
    deleteConfirm: "削除",
    testSuccess: "接続成功 · 出口 {ip} · {region} · {latency} ms",
    testFailure: "接続失敗 · {error}",
    nameRequired: "名前を入力してください。",
    nameInvalid: "名前に使用できない文字が含まれています。",
    nameTooLong: "名前が長すぎます。",
    typeInvalid: "HTTP、HTTPS、SOCKS5 のいずれかを選択してください。",
    hostRequired: "ホストを入力してください。",
    hostInvalid: "ホストに空白や制御文字は使用できません。",
    hostTooLong: "ホストが長すぎます。",
    portInvalid: "ポートは 1 から 65535 の範囲で入力してください。",
    usernameInvalid: "ユーザー名に使用できない文字が含まれています。",
    usernameTooLong: "ユーザー名が長すぎます。",
    passwordInvalid: "パスワードに使用できない文字が含まれています。",
    passwordTooLong: "パスワードが長すぎます。",
    errorInvalidName: "名前を入力してください。",
    errorInvalidType: "HTTP、HTTPS、SOCKS5 のいずれかを選択してください。",
    errorInvalidHost: "有効なホストを入力してください。",
    errorInvalidPort: "ポートは 1 から 65535 の範囲で入力してください。",
    errorInvalidUsername: "ユーザー名が無効です。",
    errorInvalidPassword: "パスワードが無効です。",
    errorNotFound: "このプロキシは存在しません。",
    errorInvalidJson: "リクエストが有効な JSON ではありません。",
    errorTooLarge: "リクエストが大きすぎます。",
    errorUnauthorized: "ローカルサービスのトークンが無効です。ページを再読み込みしてください。",
    errorForbidden: "ローカルサービスがリクエストを拒否しました。",
    errorInternal: "ローカルサービスがリクエストを完了できませんでした。",
    errorAccountNotFound: "このIDは存在しません。",
    errorAccountSignedIn: "このアカウントはまだサインイン中です。先に magpie でサインアウトしてください。",
    errorAccountAuthUnreadable: "サインイン中のアカウントを読み取れなかったため、何も変更しませんでした。",
    errorAccountInvalid: "このIDの指定が無効です。",
    errorAccountRetiredMissing: "このIDはこのプロバイダーに存在しません。",
    errorAccountMismatch: "サインインで返されたアカウントが選択したIDと異なるため、何も書き込みませんでした。",
    errorNetwork: "ローカルサービスに接続できません。",
    errorGeneric: "リクエストに失敗しました。",
    testTimeout: "接続がタイムアウトしました。",
    testRefused: "プロキシが接続を拒否しました。",
    testDns: "プロキシホストを解決できません。",
    testReset: "プロキシが接続を閉じました。",
    testProxyAuth: "プロキシ認証に失敗しました。",
    testTunnel: "プロキシがトンネルを拒否しました。",
    testEndpointHttp: "テスト先が HTTP エラーを返しました。",
    testEndpointJson: "テスト先が有効な JSON を返しませんでした。",
    testTls: "テスト先との安全な接続に失敗しました。",
    testSocksAuth: "SOCKS5 認証に失敗しました。",
    testSocksRefused: "SOCKS5 プロキシが接続を拒否しました。",
    testSocksHost: "SOCKS5 プロキシがテスト先に到達できません。",
    testSocksGeneral: "SOCKS5 プロキシが接続できません。",
    testUnknown: "このプロキシ経由でテスト先に到達できません。",
  },
};

function languageOf(lang) {
  const parts = String(lang || "en").toLowerCase().replaceAll("_", "-").split("-");
  if (parts[0] === "zh") {
    return parts.includes("hant") ||
      (!parts.includes("hans") && parts.some((part) => ["tw", "hk", "mo"].includes(part)))
      ? "zh-Hant"
      : "zh-Hans";
  }
  return parts[0];
}

const query = new URLSearchParams(location.search);
const langKey = languageOf(query.get("lang") || navigator.language);
const text = messages[langKey] || messages.en;
document.documentElement.lang = messages[langKey] ? langKey : "en";

// The launcher passes the window theme it read from magpie. Fall back to the
// OS preference when there is none, so a plain browser visit still looks right.
const theme = query.get("theme");
if (theme === "dark" || theme === "light") {
  document.documentElement.dataset.theme = theme;
} else {
  document.documentElement.dataset.theme =
    window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

const token = document.querySelector('meta[name="clean-login-token"]')?.content || "";
const byId = (id) => document.getElementById(id);

let proxies = [];
const rowTests = new Map();
// Filter state is per document and never persisted: magpie mounts the page in
// an opaque-origin sandbox frame where web storage is not available.
const proxyFilter = { regions: new Set(), minLatency: "", maxLatency: "" };
let scoreJob = null;
let scoreStarting = false;
let scoreStartingId = "";
let scoreCancelling = false;
let scoreBrowserOpen = false;
let scoreNotice = "";
let scoreNoticeKind = "";
let scoreTimer = null;
const confirmController = createConfirmController();
// What the confirm dialog is about to delete: a proxy row or an account
// identity. The dialog is shared, so the kind is remembered with the target.
let confirmKind = "proxy";
let pendingIdentity = null;
let dialogContext = null;
let deleting = false;
let environment = null;
let environmentJob = null;
let environmentRequestError = "";
let environmentBusy = false;
let environmentTimer = null;
// The account identities the service knows about (GET /api/accounts). An
// identity is one account directory with its pinned fingerprint; the list
// never carries a path or a credential.
let accountIdentities = [];
let accountIdentitiesError = "";
let accountIdentitiesNotice = "";
let accountIdentitiesLoading = false;
let clearingIdentityKey = "";

const errorKeys = {
  signed_in: "errorAccountSignedIn",
  auth_unreadable: "errorAccountAuthUnreadable",
  retired_missing: "errorAccountRetiredMissing",
  identity_mismatch: "errorAccountMismatch",
  invalid_account: "errorAccountInvalid",
  invalid_name: "errorInvalidName",
  invalid_type: "errorInvalidType",
  invalid_host: "errorInvalidHost",
  invalid_port: "errorInvalidPort",
  invalid_username: "errorInvalidUsername",
  invalid_password: "errorInvalidPassword",
  not_found: "errorNotFound",
  invalid_json: "errorInvalidJson",
  payload_too_large: "errorTooLarge",
  unauthorized: "errorUnauthorized",
  forbidden: "errorForbidden",
  internal: "errorInternal",
  network: "errorNetwork",
};

const testErrorKeys = {
  timeout: "testTimeout",
  refused: "testRefused",
  dns: "testDns",
  reset: "testReset",
  proxy_auth: "testProxyAuth",
  proxy_tunnel: "testTunnel",
  endpoint_http: "testEndpointHttp",
  endpoint_json: "testEndpointJson",
  tls: "testTls",
  socks_auth: "testSocksAuth",
  socks_refused: "testSocksRefused",
  socks_host: "testSocksHost",
  socks_general: "testSocksGeneral",
  invalid_endpoint: "testEndpointJson",
  unknown: "testUnknown",
};

function apiErrorText(code) {
  return text[errorKeys[code]] || text.errorGeneric;
}

// The account routes reuse some codes (`not_found`) with an account-specific
// meaning, so they get their own map instead of the proxy wording.
const accountErrorKeys = {
  not_found: "errorAccountNotFound",
  signed_in: "errorAccountSignedIn",
  auth_unreadable: "errorAccountAuthUnreadable",
  invalid_account: "errorAccountInvalid",
  retired_missing: "errorAccountRetiredMissing",
  identity_mismatch: "errorAccountMismatch",
};

function accountErrorText(error) {
  return text[accountErrorKeys[error?.code]] || serverErrorText(error);
}

function testErrorText(result) {
  return text[testErrorKeys[result?.errorCode]] || result?.error || text.testUnknown;
}

const environmentErrorKeys = {
  insufficient_disk: "errorInsufficientDisk",
  installer_unavailable: "errorInstallerUnavailable",
  download_failed: "errorDownloadFailed",
  rate_limited: "errorRateLimited",
  extract_failed: "errorExtractFailed",
  checksum_mismatch: "errorDownloadFailed",
  install_failed: "errorDownloadFailed",
  unknown: "errorEnvironmentUnknown",
};

function environmentErrorText(code) {
  return text[environmentErrorKeys[code]] || text.errorEnvironmentUnknown;
}

function applyText() {
  document.title = text.title;
  byId("page-title").textContent = text.title;
  byId("page-subtitle").textContent = text.subtitle;
  byId("tab-providers-label").textContent = text.providers;
  byId("tab-proxies-label").textContent = text.proxies;
  byId("providers-title").textContent = text.providersTitle;
  byId("providers-copy").textContent = text.providersCopy;
  byId("providers-empty-title").textContent = text.providersEmptyTitle;
  byId("providers-empty-copy").textContent = text.providersEmptyCopy;
  byId("environment-title").textContent = text.environmentTitle;
  byId("environment-copy").textContent = text.environmentCopy;
  byId("environment-size-label").textContent = text.environmentSizeLabel;
  byId("environment-disk-label").textContent = text.environmentDiskLabel;
  byId("environment-location-label").textContent = text.environmentLocationLabel;
  byId("environment-badge").textContent = text.environmentBadgeMissing;
  byId("environment-prepare").textContent = text.environmentPrepare;
  byId("environment-cancel").textContent = text.environmentCancel;
  byId("environment-retry").textContent = text.environmentRetry;
  byId("proxies-title").textContent = text.proxiesTitle;
  byId("proxies-copy").textContent = text.proxiesCopy;
  byId("proxies-empty-title").textContent = text.proxiesEmptyTitle;
  byId("proxies-empty-copy").textContent = text.proxiesEmptyCopy;
  byId("add-proxy-label").textContent = text.addProxy;
  byId("add-proxy-empty").textContent = text.addProxy;
  byId("retry").textContent = text.retry;
  byId("col-name").textContent = text.colName;
  byId("col-address").textContent = text.colAddress;
  byId("col-region").textContent = text.colRegion;
  byId("col-status").textContent = text.colStatus;
  byId("col-checked").textContent = text.colChecked;
  byId("col-score").textContent = text.colScore;
  byId("filter-region-label").textContent = text.filterRegionLabel;
  byId("filter-latency-label").textContent = text.filterLatencyLabel;
  byId("filter-latency-min").placeholder = text.filterLatencyMin;
  byId("filter-latency-max").placeholder = text.filterLatencyMax;
  byId("filter-latency-min").setAttribute("aria-label", text.filterLatencyMin);
  byId("filter-latency-max").setAttribute("aria-label", text.filterLatencyMax);
  byId("filter-reset").textContent = text.filterReset;
  byId("score-cancel").textContent = text.scoreCancel;
  byId("label-name").textContent = text.name;
  byId("label-type").textContent = text.type;
  byId("label-port").textContent = text.port;
  byId("label-host").textContent = text.host;
  byId("username-label").textContent = text.username;
  byId("password-label").textContent = text.password;
  byId("username-optional").textContent = text.optional;
  byId("password-optional").textContent = text.optional;
  byId("proxy-name").placeholder = text.namePlaceholder;
  byId("proxy-host").placeholder = text.hostPlaceholder;
  byId("proxy-port").placeholder = text.portPlaceholder;
  byId("proxy-dialog-title").textContent = text.addProxyTitle;
  byId("proxy-dialog-copy").textContent = text.proxyDialogCopy;
  byId("test-proxy").textContent = text.testConnection;
  byId("proxy-cancel").textContent = text.cancel;
  byId("save-proxy").textContent = text.save;
  byId("proxy-close").setAttribute("aria-label", text.close);
  byId("confirm-title").textContent = text.deleteTitle;
  byId("confirm-copy").textContent = "";
  byId("confirm-cancel").textContent = text.cancel;
  byId("confirm-action").textContent = text.deleteConfirm;
  byId("confirm-close").setAttribute("aria-label", text.close);
  byId("signin-title").textContent = text.signInTitle;
  byId("signin-copy").textContent = text.signInCopy;
  byId("signin-unverified").textContent = text.signInUnverified;
  byId("signin-proxy-label").textContent = text.signInProxyLabel;
  byId("signin-method-label").textContent = text.signInMethodLabel;
  byId("signin-start").textContent = text.signInStart;
  byId("signin-cancel").textContent = text.signInCancel;
  byId("signin-close").setAttribute("aria-label", text.signInClose);
  byId("signin-close-footer").textContent = text.signInClose;
  byId("signin-account-label").textContent = text.signInAccountLabel;
  byId("signin-account-hint").textContent = text.signInAccountHint;
  byId("identities-title").textContent = text.identitiesTitle;
  byId("identities-copy").textContent = text.identitiesCopy;
  byId("identities-retry").textContent = text.identitiesRetry;
}

function selectTab(name) {
  const providers = name !== "proxies";
  byId("tab-providers").classList.toggle("is-active", providers);
  byId("tab-proxies").classList.toggle("is-active", !providers);
  byId("tab-providers").setAttribute("aria-selected", String(providers));
  byId("tab-proxies").setAttribute("aria-selected", String(!providers));
  byId("panel-providers").hidden = !providers;
  byId("panel-proxies").hidden = providers;
}

function setServiceState(state, label) {
  byId("service-state").dataset.state = state;
  byId("service-label").textContent = label;
}

function setFormError(message) {
  const node = byId("proxy-form-error");
  node.textContent = message || "";
  node.hidden = !message;
}

function setConfirmError(message) {
  const node = byId("confirm-error");
  node.textContent = message || "";
  node.hidden = !message;
}

function setTestResult(state, message) {
  const node = byId("proxy-test-result");
  node.className = `proxy-test-result${state ? ` ${state}` : ""}`;
  node.textContent = message;
  node.hidden = false;
}

function clearTestResult() {
  const node = byId("proxy-test-result");
  node.className = "proxy-test-result";
  node.textContent = "";
  node.hidden = true;
}

function formatTime(value) {
  if (!value) return text.never;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text.never;
  try {
    return new Intl.DateTimeFormat(langKey, { dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return date.toISOString();
  }
}

async function api(path, { method = "GET", body, signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        [TOKEN_HEADER]: token,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    const wrapped = new Error("network");
    wrapped.code = "network";
    throw wrapped;
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    // A non-JSON error body is handled by the status check below.
  }
  if (!response.ok) {
    // A 403 token mismatch is expected when the service restarted while this
    // page stayed open. Reload once to pick up the new token; a second
    // mismatch (the reloaded document still carries the marker) falls through
    // to the normal error path instead of reloading again.
    if (data?.reload && reloadGuard.reloadOnce()) {
      return new Promise(() => {});
    }
    const error = new Error(data?.error || `http_${response.status}`);
    error.code = data?.error || `http_${response.status}`;
    // The server reports `{ error: code, message: humanText }`. Keep the two
    // apart so the sign-in dialog can show the exact code and message instead
    // of collapsing them into one string.
    error.serverMessage = typeof data?.message === "string" ? data.message : "";
    error.status = response.status;
    throw error;
  }
  return data;
}

function replaceProxy(proxy) {
  const index = proxies.findIndex((item) => item.id === proxy.id);
  if (index >= 0) proxies[index] = proxy;
  else proxies.push(proxy);
}

function miniButton(label, onClick, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `mini-button${danger ? " danger" : ""}`;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

// True while this row's score is running locally. `scoreStartingId` covers the
// gap between the click and the POST response, when no job object exists yet.
function scoreActiveFor(proxyId) {
  if (scoreStarting && String(scoreStartingId) === String(proxyId)) return true;
  return isScoreActive(scoreJob?.state) && String(scoreJob?.proxyId || "") === String(proxyId);
}

// The Score cell. A running job wins over a stored value so the row shows
// progress; a failure shows the server's own reason instead of a stale score.
function proxyScoreCell(proxy) {
  const cell = document.createElement("div");
  cell.className = "proxy-score-cell";
  if (scoreActiveFor(proxy.id)) {
    const active = document.createElement("span");
    active.className = "proxy-score is-active";
    active.textContent = text.scoring;
    cell.append(active);
    return cell;
  }
  const view = scoreView(proxy);
  if (view.state === "failed") {
    const reason = [view.errorCode, view.error].filter(Boolean).join(" · ");
    const failed = document.createElement("span");
    failed.className = "proxy-score is-failed";
    failed.textContent = text.scoreFailed;
    cell.title = reason;
    cell.append(failed);
    if (reason) {
      const detail = document.createElement("small");
      detail.className = "proxy-score-error";
      detail.textContent = reason;
      cell.append(detail);
    }
    return cell;
  }
  if (view.state === "scored") {
    const value = document.createElement("span");
    value.className = `proxy-score ${view.tone}`;
    value.textContent = String(view.score);
    cell.append(value);
    if (view.label) {
      const label = document.createElement("small");
      label.className = "proxy-score-label";
      label.textContent = view.label;
      cell.append(label);
    }
    if (view.ip) {
      const ip = document.createElement("small");
      ip.className = "proxy-score-ip";
      ip.textContent = view.ip;
      cell.append(ip);
    }
    if (view.checkedAt) cell.title = formatTime(view.checkedAt);
    return cell;
  }
  const none = document.createElement("span");
  none.className = "proxy-score none";
  none.textContent = "—";
  cell.append(none);
  return cell;
}

function proxyRow(proxy) {
  const row = document.createElement("div");
  row.className = "proxy-row";
  row.dataset.proxyId = proxy.id;

  const name = document.createElement("div");
  name.className = "proxy-name";
  const title = document.createElement("strong");
  title.textContent = proxy.name || proxy.id;
  const type = document.createElement("small");
  type.textContent = String(proxy.type || "").toUpperCase();
  name.append(title, type);

  const address = document.createElement("div");
  address.className = "proxy-address";
  address.textContent = formatAddress(proxy);

  const region = document.createElement("div");
  region.className = "proxy-region";
  region.textContent = proxy.region || text.unknown;
  if (proxy.exitIp) {
    const exit = document.createElement("small");
    exit.textContent = `${text.exitIp} ${proxy.exitIp}`;
    region.append(exit);
  }

  const statusCell = document.createElement("div");
  statusCell.className = "proxy-status-cell";
  const view = statusView(proxy, text, rowTests.has(proxy.id));
  const status = document.createElement("span");
  status.className = `proxy-status ${view.state}`;
  status.textContent = view.state === "ok" && view.detail
    ? `${view.label} · ${view.detail}`
    : view.label;
  statusCell.append(status);
  if (view.state === "error") {
    const reason = document.createElement("small");
    reason.className = "proxy-error";
    reason.textContent = testErrorText(proxy);
    statusCell.append(reason);
  }

  const checked = document.createElement("div");
  checked.className = "proxy-checked";
  checked.textContent = formatTime(proxy.lastCheckedAt);

  const scoreCell = proxyScoreCell(proxy);

  const actions = document.createElement("div");
  actions.className = "proxy-actions";
  const testing = rowTests.has(proxy.id);
  const test = miniButton(testing ? text.testing : text.test, () => testRowProxy(proxy.id));
  test.disabled = testing;
  const running = scoreActiveFor(proxy.id);
  const score = miniButton(running ? text.scoring : text.scoreAction, () => scoreProxy(proxy.id));
  // No concurrency: while any score is running, every score button is disabled
  // (the server would answer 409). A local 409 still surfaces the busy message.
  score.disabled = running || scoreStarting || isScoreActive(scoreJob?.state);
  if (!running && score.disabled) score.title = text.scoreBusy;
  const edit = miniButton(text.edit, () => openProxyDialog(proxy));
  const remove = miniButton(text.delete, () => askDelete(proxy), true);
  actions.append(score, test, edit, remove);

  row.append(name, address, region, scoreCell, statusCell, checked, actions);
  return row;
}

function renderProxies() {
  const list = byId("proxies-list");
  const empty = byId("proxies-empty");
  const table = byId("proxy-table");
  const filters = byId("proxy-filters");
  byId("proxy-count").textContent = String(proxies.length);
  const hasProxies = proxies.length > 0;
  empty.hidden = hasProxies;
  table.hidden = !hasProxies;
  filters.hidden = !hasProxies;
  list.textContent = "";
  if (!hasProxies) {
    renderScoreBar();
    return;
  }
  renderFilterChips();
  const visible = filterProxies(proxies, proxyFilter);
  byId("filter-count").textContent = text.filterCount
    .replace("{shown}", String(visible.length))
    .replace("{total}", String(proxies.length));
  if (visible.length === 0) {
    const note = document.createElement("p");
    note.className = "proxy-filter-empty";
    note.textContent = text.filterNoMatch;
    list.append(note);
  } else {
    for (const proxy of visible) list.append(proxyRow(proxy));
  }
  renderScoreBar();
}

// Region chips rebuilt from the current data: one toggle per distinct region
// with its count, plus an "All" chip that clears the region selection. The
// untested/empty region is its own chip. Every control is type="button".
function renderFilterChips() {
  const wrap = byId("filter-regions");
  wrap.textContent = "";
  const regions = distinctRegions(proxies);
  const available = new Set(regions.map((item) => item.region));
  for (const region of [...proxyFilter.regions]) {
    if (!available.has(region)) proxyFilter.regions.delete(region);
  }
  const all = document.createElement("button");
  all.type = "button";
  all.className = `filter-chip filter-chip-all${proxyFilter.regions.size === 0 ? " is-active" : ""}`;
  all.setAttribute("aria-pressed", String(proxyFilter.regions.size === 0));
  all.textContent = text.filterAllRegions;
  all.addEventListener("click", () => {
    proxyFilter.regions.clear();
    renderProxies();
  });
  wrap.append(all);
  for (const { region, count } of regions) {
    const chip = document.createElement("button");
    chip.type = "button";
    const selected = proxyFilter.regions.has(region);
    chip.className = `filter-chip${selected ? " is-active" : ""}`;
    chip.dataset.region = region;
    chip.setAttribute("aria-pressed", String(selected));
    const label = document.createElement("span");
    label.textContent = region || text.regionUntested;
    const badge = document.createElement("span");
    badge.className = "filter-chip-count";
    badge.textContent = String(count);
    chip.append(label, badge);
    chip.addEventListener("click", () => {
      if (proxyFilter.regions.has(region)) proxyFilter.regions.delete(region);
      else proxyFilter.regions.add(region);
      renderProxies();
    });
    wrap.append(chip);
  }
}

function resetProxyFilters() {
  proxyFilter.regions.clear();
  proxyFilter.minLatency = "";
  proxyFilter.maxLatency = "";
  byId("filter-latency-min").value = "";
  byId("filter-latency-max").value = "";
  renderProxies();
}

// --- Trust Score -----------------------------------------------------------
//
// Clicking a row's Score button starts POST /api/proxies/<id>/score and then
// polls GET /api/proxy-score until the job settles; the list is re-read once it
// does. The job is singular, so the page refuses a second run locally and, if
// the server still answers 409 score_busy, adopts the running job and says so
// instead of failing silently.

function renderScoreBar() {
  const bar = byId("proxy-score-bar");
  const state = scoreJob?.state;
  const active = scoreStarting || isScoreActive(state);
  let message = "";
  let kind = "";
  if (scoreStarting) {
    message = text.scoreStateLaunching;
    kind = "active";
  } else if (isScoreActive(state)) {
    message = state === "measuring" ? text.scoreStateMeasuring : text.scoreStateLaunching;
    if (scoreJob?.proxyName) message = `${message} ${scoreJob.proxyName}`;
    kind = "active";
  } else if (scoreNotice) {
    message = scoreNotice;
    kind = scoreNoticeKind;
  }
  bar.hidden = !message && !scoreBrowserOpen;
  bar.dataset.kind = kind;
  byId("proxy-score-state").textContent = message;
  const cancel = byId("score-cancel");
  cancel.hidden = !(active || scoreBrowserOpen);
  cancel.disabled = scoreCancelling;
}

function setScoreNotice(message, kind = "") {
  scoreNotice = message || "";
  scoreNoticeKind = kind;
}

function stopScorePolling() {
  if (scoreTimer) {
    clearTimeout(scoreTimer);
    scoreTimer = null;
  }
}

function startScorePolling() {
  stopScorePolling();
  scoreTimer = setTimeout(pollScore, 900);
}

async function reloadProxies() {
  try {
    const data = await api("api/proxies");
    if (Array.isArray(data?.proxies)) {
      proxies = data.proxies;
      renderProxies();
    }
  } catch (error) {
    setScoreNotice(serverErrorText(error), "error");
  }
}

async function pollScore() {
  scoreTimer = null;
  try {
    const data = await api("api/proxy-score");
    if (data && "job" in data) scoreJob = data.job;
    if (data && "browserOpen" in data) scoreBrowserOpen = Boolean(data.browserOpen);
  } catch (error) {
    // One dropped poll must not stop the loop; the next tick retries.
    setScoreNotice(serverErrorText(error), "error");
    if (scoreStarting || isScoreActive(scoreJob?.state)) startScorePolling();
    renderProxies();
    return;
  }
  const state = scoreJob?.state;
  if (scoreStarting || isScoreActive(state)) {
    renderProxies();
    startScorePolling();
    return;
  }
  scoreStarting = false;
  scoreStartingId = "";
  if (isScoreSettled(state)) {
    if (state === "error") {
      const detail = [scoreJob?.errorCode, scoreJob?.error].filter(Boolean).join(" · ");
      setScoreNotice([text.scoreStateError, detail].filter(Boolean).join(" · "), "error");
    } else if (state === "cancelled") {
      setScoreNotice(text.scoreStateCancelled);
    } else {
      setScoreNotice(text.scoreStateDone);
    }
    await reloadProxies();
  }
  renderProxies();
}

async function adoptScoreJob() {
  try {
    const data = await api("api/proxy-score");
    if (data && "job" in data) scoreJob = data.job;
    if (data && "browserOpen" in data) scoreBrowserOpen = Boolean(data.browserOpen);
    renderProxies();
    if (isScoreActive(scoreJob?.state)) startScorePolling();
  } catch (error) {
    setScoreNotice(serverErrorText(error), "error");
    renderProxies();
  }
}

async function scoreProxy(id) {
  if (scoreStarting || isScoreActive(scoreJob?.state)) {
    setScoreNotice(text.scoreBusy, "warn");
    renderProxies();
    return;
  }
  const proxy = proxies.find((item) => item.id === id);
  if (!proxy) return;
  scoreStarting = true;
  scoreStartingId = id;
  setScoreNotice("");
  scoreBrowserOpen = true;
  renderProxies();
  try {
    const data = await api(`api/proxies/${encodeURIComponent(id)}/score`, { method: "POST" });
    scoreStarting = false;
    scoreStartingId = "";
    scoreJob = data?.job ?? { state: "launching", proxyId: id, proxyName: proxy.name };
    if (data && "browserOpen" in data) scoreBrowserOpen = Boolean(data.browserOpen);
    renderProxies();
    startScorePolling();
  } catch (error) {
    scoreStarting = false;
    scoreStartingId = "";
    scoreBrowserOpen = false;
    if (error?.code === "score_busy") {
      setScoreNotice(text.scoreBusy, "warn");
      await adoptScoreJob();
      return;
    }
    setScoreNotice(serverErrorText(error), "error");
    renderProxies();
  }
}

async function cancelScore() {
  if (scoreCancelling) return;
  scoreCancelling = true;
  renderScoreBar();
  try {
    const data = await api("api/proxy-score/cancel", { method: "POST" });
    if (data && "job" in data) scoreJob = data.job;
    else await adoptScoreJob();
    if (data && "browserOpen" in data) scoreBrowserOpen = Boolean(data.browserOpen);
    else scoreBrowserOpen = false;
  } catch (error) {
    setScoreNotice(serverErrorText(error), "error");
  } finally {
    scoreCancelling = false;
    renderProxies();
  }
  if (scoreStarting || isScoreActive(scoreJob?.state)) startScorePolling();
}

async function loadScoreStatus() {
  // A running job survives a reload in the service, so adopt it on load. A
  // missing route (an older service) is ignored rather than shown as an error.
  try {
    const data = await api("api/proxy-score");
    if (data && "job" in data) scoreJob = data.job;
    if (data && "browserOpen" in data) scoreBrowserOpen = Boolean(data.browserOpen);
  } catch {
    return;
  }
  renderProxies();
  if (isScoreActive(scoreJob?.state)) startScorePolling();
}

function providerCard(provider) {
  const card = document.createElement("article");
  card.className = "provider-card";
  card.dataset.providerId = provider.id;

  // The marker text for one method kind, in the page's language. The five
  // kinds are told apart: a known browser sign-in, a method that needs details
  // typed in, a local session, a pasted key, and a kind that is only confirmed
  // when the sign-in starts.
  function methodTagText(category) {
    return methodCategoryText(category, text);
  }

  const head = document.createElement("div");
  head.className = "provider-head";

  const mark = document.createElement("span");
  mark.className = `provider-mark tone-${provider.mark?.tone || "neutral"}`;
  mark.textContent = provider.mark?.text || String(provider.name || "?").slice(0, 1);
  mark.setAttribute("aria-hidden", "true");

  const name = document.createElement("h3");
  name.className = "provider-name";
  name.textContent = provider.name || provider.id;

  const status = providerStatusView(provider, text);
  const statusNode = document.createElement("span");
  statusNode.className = `provider-status ${status.state}`;
  statusNode.textContent = status.label;

  head.append(mark, name, statusNode);

  const description = document.createElement("p");
  description.className = "provider-description";
  description.textContent = localizedText(provider.description, langKey);

  const reason = document.createElement("p");
  reason.className = "provider-reason";
  reason.textContent = localizedText(provider.capability?.reason, langKey);

  const notice = document.createElement("p");
  notice.className = "provider-notice";
  notice.textContent = localizedText(provider.notice, langKey);

  card.append(head, description, reason);
  const presenceNode = document.createElement("p");
  presenceNode.className = "provider-presence";
  presenceNode.textContent = localizedText(provider.presenceNote, langKey);
  if (presenceNode.textContent) card.append(presenceNode);
  if (notice.textContent) card.append(notice);

  // Second layer: the sign-in methods the installed provider plugins expose.
  // The labels are shown honestly, with a per-kind marker. Five kinds are told
  // apart: a known browser sign-in, a method that needs details typed in, a
  // local session, a pasted key, and a method whose kind is only known once
  // the sign-in starts (ZCode's per-site flows). The last one is never dressed
  // up as "unknown" in the sense of "nothing found": a real method exists and
  // the page shown at sign-in is the source of truth.
  const methods = Array.isArray(provider.authMethods) ? provider.authMethods : [];
  if (methods.length) {
    const methodsNode = document.createElement("p");
    methodsNode.className = "provider-methods";
    const methodsHeading = document.createElement("span");
    methodsHeading.className = "provider-methods-heading";
    methodsHeading.textContent = text.providerMethodsHeading;
    methodsNode.append(methodsHeading);
    for (const method of methods) {
      const chip = document.createElement("span");
      const category = methodCategory(method);
      chip.className = `provider-method is-${category}`;
      const methodLabel = document.createElement("span");
      methodLabel.className = "provider-method-label";
      methodLabel.textContent = method.label || method.type || text.unknown;
      const tag = document.createElement("span");
      tag.className = "provider-method-tag";
      tag.textContent = methodTagText(category);
      chip.append(methodLabel, tag);
      methodsNode.append(chip);
    }
    card.append(methodsNode);
    // The honest note for the methods whose kind the scan cannot know.
    if (methods.some((method) => methodCategory(method) === "pending")) {
      const note = document.createElement("p");
      note.className = "provider-method-note";
      note.textContent = text.providerMethodNote;
      card.append(note);
    }
  }

  const sourceNames = [];
  if (provider.sources?.local) sourceNames.push(text.providerSourceLocal);
  if (provider.sources?.magpie) sourceNames.push(text.providerSourceMagpie);
  if (provider.pluginPackage) sourceNames.push(text.providerSourcePlugins);
  if (sourceNames.length) {
    const sourceNode = document.createElement("p");
    sourceNode.className = "provider-source-line";
    sourceNode.textContent = `${text.providerSourceLineHeading}: ${sourceNames.join(" · ")}`;
    card.append(sourceNode);
  }

  // The add-account entry. It is offered whenever the installed plugin scan
  // exposed a browser sign-in method and the merge carried the plugin entry id
  // the service loads the provider by (providerCanSignIn). Capability readiness
  // is deliberately NOT a gate: an unverified flow is exactly the one users
  // should be able to try so they can report what happens. Every control is
  // type="button" with an explicit click handler because magpie mounts the page
  // in a sandbox without allow-forms; a submit control would be silently dead.
  if (providerCanSignIn(provider)) {
    const actions = document.createElement("div");
    actions.className = "provider-actions";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "button primary provider-add";
    add.dataset.providerId = provider.signInProvider;
    add.textContent = text.addAccount;
    add.addEventListener("click", () => openSignInDialog(provider));
    actions.append(add);
    card.append(actions);
  }

  return card;
}

// --- account identities ----------------------------------------------------
//
// A signed-out account keeps its directory, its profile and its pinned
// fingerprint, so the next sign-in for that credential presents the same
// machine. GET /api/accounts lists those identities (never a path, never a
// credential); DELETE /api/accounts/<provider>/<key> clears one that is not
// signed in. Every control here has a real request behind it and a visible
// outcome: loading, failure and success all say so.

function setIdentitiesError(message) {
  const node = byId("identities-error");
  node.textContent = message || "";
  node.hidden = !message;
}

function renderIdentities() {
  const card = byId("account-identities");
  const list = byId("account-identities-list");
  const retired = accountIdentities.filter((account) => account?.signedIn !== true);
  card.hidden = false;
  byId("identities-badge").textContent = String(retired.length);
  setIdentitiesError(accountIdentitiesError);
  const notice = byId("identities-notice");
  notice.textContent = accountIdentitiesNotice || "";
  notice.hidden = !accountIdentitiesNotice;
  const retry = byId("identities-retry");
  retry.hidden = !accountIdentitiesError && !accountIdentitiesLoading;
  retry.disabled = accountIdentitiesLoading;

  list.textContent = "";
  if (accountIdentitiesLoading && !retired.length) {
    const loading = document.createElement("p");
    loading.className = "identity-empty";
    loading.textContent = text.identitiesLoading;
    list.append(loading);
    return;
  }
  if (!retired.length) {
    const empty = document.createElement("p");
    empty.className = "identity-empty";
    empty.textContent = accountIdentitiesError ? text.identitiesError : text.identitiesEmpty;
    list.append(empty);
    return;
  }
  for (const account of retired) list.append(identityRow(account));
}

// One kept identity: the account's own name, its uid, when it was last signed
// in, and the entry that clears it.
function identityRow(account) {
  const view = accountIdentityView(account);
  const row = document.createElement("div");
  row.className = "identity-row";
  row.dataset.accountKey = account.key;

  const name = document.createElement("p");
  name.className = "identity-name";
  name.textContent = view.label;
  row.append(name);

  const meta = document.createElement("span");
  meta.className = "identity-meta";
  const parts = [];
  if (view.uid && view.uid !== view.label) parts.push(view.uid);
  if (view.retiredAt) {
    parts.push(
      text.identitiesLastSignedIn.replace("{time}", formatTime(view.retiredAt)),
    );
  }
  meta.textContent = parts.join(" · ");
  row.append(meta);

  const actions = document.createElement("div");
  actions.className = "identity-actions";
  const clearing = clearingIdentityKey === account.key;
  const clear = miniButton(
    clearing ? text.identitiesClearing : text.identitiesClear,
    () => askClearIdentity(account),
    true,
  );
  clear.disabled = clearing || Boolean(clearingIdentityKey);
  actions.append(clear);
  row.append(actions);
  return row;
}

// The second confirmation: the confirm dialog asks, and only its action
// button deletes. The pending target is remembered by the confirm controller,
// so a cancelled dialog never touches anything.
function askClearIdentity(account) {
  const dialog = byId("confirm-dialog");
  if (dialog.open) return;
  confirmController.ask(account.key, accountLabel(account));
  confirmKind = "identity";
  pendingIdentity = account;
  byId("confirm-title").textContent = text.identitiesClearTitle;
  byId("confirm-copy").textContent = text.identitiesClearCopy.replace(
    "{name}",
    accountLabel(account),
  );
  byId("confirm-action").textContent = text.identitiesClearConfirm;
  setConfirmError("");
  setConfirmBusy(false);
  dialog.showModal();
}

// Deletes the identity and refreshes the list. A failure keeps the identity
// and says why.
async function clearIdentity(account) {
  if (clearingIdentityKey) return;
  clearingIdentityKey = account.key;
  accountIdentitiesError = "";
  accountIdentitiesNotice = "";
  renderIdentities();
  try {
    await api(accountIdentityPath(account.provider, account.key), { method: "DELETE" });
    clearingIdentityKey = "";
    accountIdentitiesNotice = text.identitiesCleared;
    await loadAccountIdentities();
  } catch (error) {
    clearingIdentityKey = "";
    accountIdentitiesError = accountErrorText(error);
    renderIdentities();
  }
}

// Reads the identities. A failed read is reported in the card and the list
// keeps whatever it had; it never blocks the rest of the page.
async function loadAccountIdentities() {
  accountIdentitiesLoading = true;
  accountIdentitiesError = "";
  renderIdentities();
  try {
    const data = await api("api/accounts");
    accountIdentities = Array.isArray(data?.accounts) ? data.accounts : [];
    accountIdentitiesError = "";
  } catch (error) {
    accountIdentitiesError = serverErrorText(error);
  } finally {
    accountIdentitiesLoading = false;
    renderIdentities();
  }
}

// --- provider sign-in dialog ----------------------------------------------
//
// One dialog per provider card. It chooses a proxy from the stored list (the
// page never receives a password), starts POST /api/signin with the installed
// plugin entry id carried on the card, then polls GET /api/signin while the
// isolated browser window is open. A close while the flow is still running
// cancels it first so no invisible flow is left behind.

let signInContext = null;
let signInTimer = null;

function stopSignInPolling() {
  if (signInTimer) {
    clearTimeout(signInTimer);
    signInTimer = null;
  }
}

function startSignInPolling() {
  stopSignInPolling();
  signInTimer = setTimeout(pollSignIn, 800);
}

function setSignInNotice(message) {
  const node = byId("signin-notice");
  node.textContent = message || "";
  node.hidden = !message;
}

function setSignInError(message) {
  const node = byId("signin-error");
  node.textContent = message || "";
  node.hidden = !message;
}

// The server's exact code/message, never wrapped as an "unknown error".
function serverErrorText(error) {
  const code = error?.code ? String(error.code) : "";
  const message = error?.serverMessage ? String(error.serverMessage) : "";
  return [code, message].filter(Boolean).join(" · ") || apiErrorText(error?.code);
}

function signInStateLabel(state) {
  if (state === "authorizing") return text.signInStateAuthorizing;
  if (state === "waiting-login") return text.signInStateWaiting;
  if (state === "finishing") return text.signInStateFinishing;
  if (state === "done") return text.signInStateDone;
  if (state === "error") return text.signInStateError;
  if (state === "cancelled") return text.signInStateCancelled;
  return state ? String(state) : "";
}

function renderSignIn() {
  const context = signInContext;
  if (!context) return;
  const flow = context.flow;
  const state = flow?.state || "";
  const active = signInActive(state);

  const status = byId("signin-status");
  const statusState = byId("signin-status-state");
  const statusDetail = byId("signin-status-detail");
  status.hidden = !state;
  statusState.className = `signin-status-state${state ? ` ${state}` : ""}`;
  statusState.textContent = signInStateLabel(state);

  if (state === "done") {
    statusDetail.textContent = text.signInDone;
    statusDetail.hidden = false;
  } else if (state === "error") {
    statusDetail.textContent = serverErrorText(flow?.error);
    statusDetail.hidden = false;
  } else if (state === "cancelled") {
    statusDetail.textContent = text.signInCancelled;
    statusDetail.hidden = false;
  } else {
    statusDetail.textContent = "";
    statusDetail.hidden = true;
  }

  const result = byId("signin-result");
  if (state === "done" && flow?.accountKey) {
    result.hidden = false;
    byId("signin-result-label").textContent = text.signInAccountKey;
    byId("signin-result-key").textContent = flow.accountKey;
  } else {
    result.hidden = true;
    byId("signin-result-key").textContent = "";
  }

  byId("signin-start").hidden = active || context.busy;
  byId("signin-start").disabled = context.busy;
  byId("signin-start").textContent = context.busy ? text.signInStarting : text.signInStart;
  byId("signin-cancel").hidden = !active;
  byId("signin-cancel").disabled = context.busy;
}

function renderSignInProxies() {
  const select = byId("signin-proxy");
  select.textContent = "";
  const direct = document.createElement("option");
  direct.value = "";
  direct.textContent = text.signInProxyDirect;
  select.append(direct);
  for (const proxy of proxies) {
    const option = document.createElement("option");
    option.value = proxy.id;
    // Name plus address only; never the password (the API omits it and the page
    // never sees it).
    option.textContent = `${proxy.name || proxy.id} · ${formatAddress(proxy)}`;
    select.append(option);
  }
}

function selectedSignInProxy() {
  const id = byId("signin-proxy").value;
  return proxies.find((proxy) => proxy.id === id) || null;
}

// Re-read the stored proxies when the dialog opens so the dropdown reflects
// GET /api/proxies, not just the list bootstrap cached. A failed read keeps
// the bootstrap list; the dialog still works.
async function refreshSignInProxies() {
  try {
    const data = await api("api/proxies");
    if (Array.isArray(data?.proxies)) {
      const select = byId("signin-proxy");
      const previous = select.value;
      proxies = data.proxies;
      renderSignInProxies();
      // Preserve a choice the user already made while the read was in flight.
      select.value = proxies.some((proxy) => proxy.id === previous) ? previous : "";
    }
  } catch {
    // Keep whatever bootstrap already provided.
  }
}

// The sign-in methods a plugin offers, when it offers several. ZCode has one
// per site (Z.ai, BigModel, a team seat), and signing in to the wrong site
// yields the wrong token, so the user picks instead of the flow silently
// taking the first one. Only the label travels: it is the exact key the
// service looks the method up by.
function signInMethodOptions(provider) {
  const methods = Array.isArray(provider?.signInMethods) ? provider.signInMethods : [];
  return methods.filter((label) => typeof label === "string" && label.trim());
}

function renderSignInMethods(provider) {
  const field = byId("signin-method-field");
  const select = byId("signin-method");
  const hint = byId("signin-method-hint");
  const options = signInMethodOptions(provider);
  select.textContent = "";
  // The picker only appears when there is a real choice to make.
  if (options.length < 2) {
    field.hidden = true;
    hint.hidden = true;
    return;
  }
  for (const label of options) {
    const option = document.createElement("option");
    option.value = label;
    option.textContent = label;
    select.append(option);
  }
  field.hidden = false;
  hint.hidden = false;
  hint.textContent = text.signInMethodHint;
}

function selectedSignInMethod() {
  const field = byId("signin-method-field");
  if (!field || field.hidden) return null;
  const value = byId("signin-method").value;
  return typeof value === "string" && value ? value : null;
}

// The identities of this provider that are signed out. Continuing one of them
// reuses its fingerprint instead of drawing a new one.
function renderSignInAccounts(provider) {
  const field = byId("signin-account-field");
  const select = byId("signin-account");
  const hint = byId("signin-account-hint");
  const options = retiredAccounts(accountIdentities, provider);
  const previous = select.value;
  select.textContent = "";
  // The picker only appears when there is a real choice to make.
  if (!options.length) {
    field.hidden = true;
    hint.hidden = true;
    return;
  }
  const fresh = document.createElement("option");
  fresh.value = "";
  fresh.textContent = text.signInAccountNew;
  select.append(fresh);
  for (const account of options) {
    const option = document.createElement("option");
    option.value = account.key;
    const view = accountIdentityView(account);
    const parts = [view.label];
    if (view.retiredAt) {
      parts.push(text.identitiesLastSignedIn.replace("{time}", formatTime(view.retiredAt)));
    }
    option.textContent = parts.join(" · ");
    select.append(option);
  }
  // Keep a choice the user already made while the list was being re-read;
  // otherwise a provider with exactly one kept identity preselects it.
  const available = new Set(options.map((account) => account.key));
  select.value = available.has(previous)
    ? previous
    : defaultAccountKey(accountIdentities, provider);
  field.hidden = false;
  hint.hidden = false;
  hint.textContent = text.signInAccountHint;
}

// The identity the user picked, or null for a fresh account.
function selectedSignInAccount() {
  const field = byId("signin-account-field");
  if (!field || field.hidden) return null;
  const value = byId("signin-account").value;
  return typeof value === "string" && value ? value : null;
}

function openSignInDialog(provider) {
  const dialog = byId("signin-dialog");
  if (dialog.open || !providerCanSignIn(provider)) return;
  signInContext = {
    provider: provider.signInProvider,
    name: provider.name || provider.signInProvider,
    flow: null,
    busy: false,
  };
  byId("signin-provider").textContent = signInContext.name;
  renderSignInMethods(provider);
  renderSignInAccounts(provider);
  renderSignInProxies();
  byId("signin-proxy").value = "";
  setSignInNotice("");
  setSignInError("");
  renderSignIn();
  dialog.showModal();
  byId("signin-start").focus();
  refreshSignInProxies();
  // The identity list is re-read when the dialog opens: an identity may have
  // been retired (or cleared) since the page loaded.
  loadAccountIdentities().then(() => {
    if (signInContext) renderSignInAccounts(signInContext.provider);
  });
}

async function startSignIn() {
  const context = signInContext;
  if (!context || context.busy) return;
  context.busy = true;
  setSignInError("");
  setSignInNotice("");
  renderSignIn();
  try {
    await api("api/signin", {
      method: "POST",
      body: signInPayload(
        context.provider,
        selectedSignInProxy(),
        selectedSignInMethod(),
        selectedSignInAccount(),
      ),
    });
    if (signInContext !== context) return;
    context.busy = false;
    // startSignIn answers only after the browser window is open.
    context.flow = { state: "waiting-login", accountKey: null };
    setSignInNotice(text.signInOpened);
    renderSignIn();
    startSignInPolling();
  } catch (error) {
    if (signInContext !== context) return;
    context.busy = false;
    setSignInError(serverErrorText(error));
    renderSignIn();
  }
}

async function pollSignIn() {
  signInTimer = null;
  const context = signInContext;
  if (!context || !byId("signin-dialog").open) return;
  const previousState = context.flow?.state || "";
  try {
    const data = await api("api/signin");
    if (signInContext !== context) return;
    if (data?.flow) context.flow = data.flow;
  } catch (error) {
    if (signInContext !== context) return;
    setSignInError(serverErrorText(error));
    renderSignIn();
    return;
  }
  renderSignIn();
  const state = context.flow?.state || "";
  if (state === "done" && previousState !== "done") {
    // The account is signed in again, so it is no longer a retired identity.
    loadAccountIdentities().then(() => {
      if (signInContext) renderSignInAccounts(signInContext.provider);
    });
  }
  if (signInContext === context && signInActive(state)) {
    startSignInPolling();
  }
}

async function cancelSignIn() {
  const context = signInContext;
  if (!context) return;
  context.busy = true;
  renderSignIn();
  try {
    const data = await api("api/signin/cancel", { method: "POST" });
    if (signInContext !== context) return;
    context.flow = data?.flow || { ...(context.flow || {}), state: "cancelled" };
    context.busy = false;
    stopSignInPolling();
    renderSignIn();
  } catch (error) {
    if (signInContext !== context) return;
    context.busy = false;
    setSignInError(serverErrorText(error));
    renderSignIn();
  }
}

function cleanupSignInDialog() {
  stopSignInPolling();
  signInContext = null;
  setSignInNotice("");
  setSignInError("");
  byId("signin-result").hidden = true;
  byId("signin-result-key").textContent = "";
  byId("signin-status").hidden = true;
}

function closeSignInDialog() {
  const dialog = byId("signin-dialog");
  if (signInContext && signInActive(signInContext.flow?.state)) {
    // Cancel first, then close: closing must never leave a running flow that
    // the user can no longer see.
    cancelSignIn().finally(() => {
      if (byId("signin-dialog").open) byId("signin-dialog").close();
      else cleanupSignInDialog();
    });
    return;
  }
  if (dialog.open) dialog.close();
  else cleanupSignInDialog();
}

// The launcher forwards magpie's provider list in the navigation hash. It is
// untrusted input: a bad parse falls back to the local list. The raw payload
// is posted to the service for normalization; the real shape of
// `providers:list` has not been verified on this machine.
function magpiePayloadFromHash() {
  try {
    const raw = new URLSearchParams(String(location.hash || "").replace(/^#/, "")).get("providers");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function pluginScanNote(plugins) {
  if (plugins?.available) {
    return text.providerPluginsFound
      .replace("{count}", String(plugins.count ?? 0))
      .replace("{browser}", String(plugins.browserMethods ?? 0));
  }
  if (plugins?.scanning || plugins?.stale) return text.providerPluginsScanning;
  return text.providerPluginsUnavailable;
}

function renderProviderSources(view) {
  const node = byId("provider-sources");
  if (!node) return;
  if (!view) {
    node.hidden = true;
    return;
  }
  node.hidden = false;
  const fromMagpie = view.source === "magpie";
  const badge = byId("provider-sources-badge");
  badge.textContent = fromMagpie ? text.providersSourceMagpie : text.providersSourceLocal;
  badge.dataset.source = fromMagpie ? "magpie" : "local";
  const note = byId("provider-sources-note");
  const pluginNote = pluginScanNote(view.plugins);
  if (!fromMagpie) {
    note.textContent = `${text.providersDiffUnavailable} · ${pluginNote}`;
    return;
  }
  const counts = view.counts || {};
  const differences = (Number(counts.localOnly) || 0) + (Number(counts.magpieOnly) || 0);
  const diffNote = differences === 0
    ? text.providersDiffNone
    : text.providersDiff
        .replace("{both}", String(counts.both ?? 0))
        .replace("{localOnly}", String(counts.localOnly ?? 0))
        .replace("{magpieOnly}", String(counts.magpieOnly ?? 0));
  note.textContent = `${diffNote} · ${pluginNote}`;
}

function renderProviders(items) {
  const list = byId("providers-list");
  const empty = byId("providers-empty");
  byId("provider-count").textContent = String(items.length);
  const hasProviders = items.length > 0;
  empty.hidden = hasProviders;
  list.hidden = !hasProviders;
  list.textContent = "";
  if (!hasProviders) return;
  for (const provider of items) list.append(providerCard(provider));
}

function render(data) {
  const view = data?.providerSources;
  const providers = view && Array.isArray(view.providers)
    ? view.providers
    : Array.isArray(data?.providers) ? data.providers : [];
  proxies = Array.isArray(data?.proxies) ? data.proxies : [];
  renderProviders(providers);
  renderProviderSources(view);
  renderProxies();
  byId("version").textContent = data?.version ? `v${data.version}` : "";
  const ready = data?.service?.status === "ready";
  setServiceState(ready ? "ready" : "error", ready ? text.ready : text.failed);
  byId("retry").hidden = ready;
}

// --- one-time login browser setup -----------------------------------------
//
// The setup card is driven entirely by /api/environment. It is shown for as
// long as the API has answered (missing/preparing/ready/error/cancelled), so
// the user can always see where the browser lives and how the download was
// verified; in the ready state it carries a Ready badge and no action button.
// While a prepare job is running the page polls /api/environment/job until the
// phase leaves preparing, then every control except the one that fits the
// settled state is hidden, so the card never keeps an inert button around.

function environmentBadgeFor(phase) {
  if (phase === "ready") return text.environmentBadgeReady;
  if (phase === "preparing") return text.environmentBadgePreparing;
  if (phase === "error") return text.environmentBadgeError;
  if (phase === "cancelled") return text.environmentBadgeCancelled;
  return text.environmentBadgeMissing;
}

// The default asset ships a published sha256 that defaultInstaller always
// enforces, so it is verified even before the first install. An override only
// counts as verified once its own digest matches; an override without a
// digest stays unverified. The manager may report this as a boolean or as a
// status string, so both shapes are accepted.
function environmentChecksumVerified(env) {
  if (env?.checksumVerified === true) return true;
  const status = String(env?.checksumStatus || "").toLowerCase();
  if (status === "verified" || status === "ok" || status === "published") return true;
  return env?.assetOverride === false;
}

function environmentRequestErrorText(error) {
  const code = error?.code;
  if (code && environmentErrorKeys[code]) return text[environmentErrorKeys[code]];
  return apiErrorText(code);
}

function stopEnvironmentPolling() {
  if (environmentTimer) {
    clearTimeout(environmentTimer);
    environmentTimer = null;
  }
}

function startEnvironmentPolling() {
  stopEnvironmentPolling();
  environmentTimer = setTimeout(pollEnvironment, 1000);
}

async function pollEnvironment() {
  environmentTimer = null;
  if (!environment || environmentPhase(environment, environmentJob) !== "preparing") return;
  try {
    const data = await api("api/environment/job");
    if (data?.environment) environment = data.environment;
    if (data && "job" in data) environmentJob = data.job;
    environmentRequestError = "";
  } catch (error) {
    // One dropped poll must not stop the loop; the next tick retries.
    environmentRequestError = environmentRequestErrorText(error);
  }
  renderEnvironment();
}

function renderEnvironment() {
  const card = byId("environment-setup");
  if (!environment) {
    card.hidden = true;
    stopEnvironmentPolling();
    return;
  }
  const phase = environmentPhase(environment, environmentJob);
  card.hidden = false;

  const badge = byId("environment-badge");
  badge.textContent = environmentBadgeFor(phase);
  badge.dataset.state = phase;

  byId("environment-size-value").textContent = text.environmentSizeValue
    .replace("{size}", formatBytes(environment.downloadBytes) || text.unknown)
    .replace("{extracted}", formatBytes(environment.extractedBytes) || text.unknown);
  byId("environment-disk-value").textContent = text.environmentDiskValue
    .replace("{free}", formatBytes(environment.freeBytes) || text.unknown)
    .replace("{required}", formatBytes(environment.requiredDiskBytes) || text.unknown);
  byId("environment-location-value").textContent = environment.installDir || text.unknown;

  const checksumNote = environmentChecksumVerified(environment)
    ? text.environmentChecksumVerified
    : text.environmentChecksumUnverified;
  byId("environment-note").textContent = `${text.environmentNote} ${checksumNote}`;

  const progress = environmentJob?.progress || {};
  const percent = environmentPercent(environment, environmentJob);
  const received = Number(progress.receivedBytes) || 0;
  const total = Number(progress.totalBytes) || Number(environment.downloadBytes) || 0;
  const preparing = phase === "preparing";
  byId("environment-progress").hidden = !preparing;
  byId("environment-progress-bar").style.width = `${percent}%`;
  byId("environment-progress-text").textContent = text.environmentProgress
    .replace("{percent}", String(percent))
    .replace("{received}", formatBytes(received) || text.unknown)
    .replace("{total}", formatBytes(total) || text.unknown);

  const errorText = phase === "error"
    ? environmentErrorText(environmentJob?.error?.code)
    : environmentRequestError;
  const errorNode = byId("environment-error");
  errorNode.textContent = errorText || "";
  errorNode.hidden = !errorText;

  const prepare = byId("environment-prepare");
  const cancel = byId("environment-cancel");
  const retry = byId("environment-retry");
  prepare.hidden = phase !== "missing";
  cancel.hidden = !preparing;
  retry.hidden = phase !== "error" && phase !== "cancelled";
  prepare.disabled = environmentBusy;
  cancel.disabled = environmentBusy;
  retry.disabled = environmentBusy;

  if (preparing) {
    if (!environmentTimer) startEnvironmentPolling();
  } else {
    stopEnvironmentPolling();
  }
}

async function prepareEnvironment() {
  if (environmentBusy) return;
  environmentBusy = true;
  environmentRequestError = "";
  renderEnvironment();
  try {
    const data = await api("api/environment/prepare", { method: "POST" });
    if (data?.environment) environment = data.environment;
    if (data && "job" in data) environmentJob = data.job;
  } catch (error) {
    environmentRequestError = environmentRequestErrorText(error);
  } finally {
    environmentBusy = false;
    renderEnvironment();
  }
}

async function cancelEnvironment() {
  if (environmentBusy) return;
  environmentBusy = true;
  renderEnvironment();
  try {
    const data = await api("api/environment/cancel", { method: "POST" });
    if (data?.environment) environment = data.environment;
    if (data && "job" in data) environmentJob = data.job;
    environmentRequestError = "";
  } catch (error) {
    environmentRequestError = environmentRequestErrorText(error);
  } finally {
    environmentBusy = false;
    renderEnvironment();
  }
}

async function loadEnvironment() {
  try {
    const data = await api("api/environment");
    environment = data?.environment || null;
    environmentJob = data?.job ?? null;
    environmentRequestError = "";
  } catch {
    // The environment card is optional; a failed read keeps it hidden.
    environment = null;
    environmentJob = null;
    environmentRequestError = "";
  }
  renderEnvironment();
}

async function load() {
  setServiceState("connecting", text.connecting);
  byId("retry").hidden = true;
  try {
    // Relative so it also works when magpie web mounts the service under a
    // path of its own address (magpie.service) for remote viewers.
    const data = await api("api/bootstrap");
    let providerSources = null;
    try {
      const merged = await api("api/provider-sources", {
        method: "POST",
        body: { magpie: magpiePayloadFromHash() },
      });
      providerSources = merged?.providerSources ?? null;
      // The merge result carries the plugin counts; the live scan state
      // (first scan in flight, stale cache) arrives beside it. Fold the two so
      // the source banner can say "scanning" honestly instead of "unavailable".
      if (providerSources && merged?.pluginScan) {
        providerSources.plugins = { ...providerSources.plugins, ...merged.pluginScan };
      }
    } catch {
      // The merge is an enhancement over the local bootstrap cards; a failed
      // call keeps those cards and hides the source banner.
      providerSources = null;
    }
    render({ ...data, providerSources });
    // The token is valid again, so clear the reload marker left by the one
    // automatic reload; the launcher's theme/lang and the hash stay intact.
    reloadGuard.clearMarker();
    loadEnvironment();
    loadScoreStatus();
    loadAccountIdentities();
  } catch {
    setServiceState("error", text.failed);
    byId("retry").hidden = false;
  }
}

function cancelRowTest(id) {
  const entry = rowTests.get(id);
  if (!entry) return;
  entry.guard.cancel();
  entry.controller.abort();
  rowTests.delete(id);
}

async function testRowProxy(id) {
  const proxy = proxies.find((item) => item.id === id);
  if (!proxy || rowTests.has(id)) return;
  const guard = createRequestGuard();
  const controller = new AbortController();
  const tokenForTest = guard.begin();
  rowTests.set(id, { guard, controller });
  renderProxies();
  try {
    const data = await api(`api/proxies/${encodeURIComponent(id)}/test`, {
      method: "POST",
      signal: controller.signal,
    });
    const active = rowTests.get(id);
    if (!active || active.guard !== guard || !guard.isCurrent(tokenForTest)) return;
    rowTests.delete(id);
    // A null proxy means the row was edited or removed while the probe ran;
    // the stale result must not be applied to the new state.
    if (data?.proxy) replaceProxy(data.proxy);
    renderProxies();
  } catch (error) {
    if (error?.name === "AbortError") return;
    const active = rowTests.get(id);
    if (!active || active.guard !== guard || !guard.isCurrent(tokenForTest)) return;
    rowTests.delete(id);
    const current = proxies.find((item) => item.id === id);
    if (current) {
      current.status = "error";
      current.errorCode = "network";
      current.error = text.errorNetwork;
      current.latency = null;
      current.lastCheckedAt = new Date().toISOString();
      current.updatedAt = current.lastCheckedAt;
    }
    renderProxies();
  }
}

function dialogValues() {
  return normalizeProxyForm({
    name: byId("proxy-name").value,
    type: byId("proxy-type").value,
    host: byId("proxy-host").value,
    port: byId("proxy-port").value,
    username: byId("proxy-username").value,
    password: byId("proxy-password").value,
  });
}

function validationError(values, requireName) {
  if (requireName && !values.name) return { key: "nameRequired", field: "proxy-name" };
  if (values.name && /[\u0000-\u001f\u007f]/.test(values.name)) {
    return { key: "nameInvalid", field: "proxy-name" };
  }
  if (values.name.length > 80) return { key: "nameTooLong", field: "proxy-name" };
  if (!["http", "https", "socks5"].includes(values.type)) {
    return { key: "typeInvalid", field: "proxy-type" };
  }
  if (!values.host) return { key: "hostRequired", field: "proxy-host" };
  if (values.host.length > 255 || /[\s\u0000-\u001f\u007f]/.test(values.host)) {
    return { key: "hostInvalid", field: "proxy-host" };
  }
  if (!/^\d{1,5}$/.test(values.port) || Number(values.port) < 1 || Number(values.port) > 65535) {
    return { key: "portInvalid", field: "proxy-port" };
  }
  if (values.username.length > 255 || /[\u0000-\u001f\u007f]/.test(values.username)) {
    return {
      key: values.username.length > 255 ? "usernameTooLong" : "usernameInvalid",
      field: "proxy-username",
    };
  }
  if (values.password.length > 255 || /\u0000/.test(values.password)) {
    return {
      key: values.password.length > 255 ? "passwordTooLong" : "passwordInvalid",
      field: "proxy-password",
    };
  }
  return null;
}

function showValidationError(error) {
  if (!error) return false;
  setFormError(text[error.key]);
  byId(error.field)?.focus();
  return true;
}

function payloadFor(values) {
  const payload = {
    name: values.name,
    type: values.type,
    host: values.host,
    port: Number(values.port),
    username: values.username,
  };
  if (values.password) payload.password = values.password;
  return payload;
}

function setDialogBusy(busy) {
  byId("test-proxy").disabled = busy;
  byId("save-proxy").disabled = busy;
  byId("test-proxy").textContent = busy && dialogContext?.testing
    ? text.testing
    : text.testConnection;
  byId("save-proxy").textContent = busy && dialogContext?.saving ? text.saving : text.save;
}

function cancelDialogTest() {
  const context = dialogContext;
  if (!context) return;
  context.testGuard.cancel();
  context.testAbort?.abort();
  context.testAbort = null;
  context.testing = false;
}

function cleanupProxyDialog() {
  const context = dialogContext;
  dialogContext = null;
  if (context) {
    context.testGuard.cancel();
    context.testAbort?.abort();
  }
  setFormError("");
  clearTestResult();
  setDialogBusy(false);
}

function openProxyDialog(proxy = null) {
  const dialog = byId("proxy-dialog");
  if (dialog.open) return;
  byId("proxy-form").reset();
  setFormError("");
  clearTestResult();
  dialogContext = {
    mode: proxy ? "edit" : "create",
    id: proxy?.id || "",
    testGuard: createRequestGuard(),
    testAbort: null,
    testing: false,
    saving: false,
    lastTest: null,
  };
  byId("proxy-dialog-title").textContent = proxy ? text.editProxyTitle : text.addProxyTitle;
  byId("proxy-name").value = proxy?.name || "";
  byId("proxy-type").value = proxy?.type || "http";
  byId("proxy-host").value = proxy?.host || "";
  byId("proxy-port").value = proxy?.port != null ? String(proxy.port) : "";
  byId("proxy-username").value = proxy?.username || "";
  byId("proxy-password").value = "";
  const hint = byId("proxy-password-hint");
  if (proxy?.hasPassword) {
    hint.textContent = text.passwordKeepHint;
    hint.hidden = false;
  } else {
    hint.textContent = "";
    hint.hidden = true;
  }
  setDialogBusy(false);
  dialog.showModal();
  byId("proxy-name").focus();
}

function closeProxyDialog() {
  const dialog = byId("proxy-dialog");
  if (dialog.open) dialog.close();
  else cleanupProxyDialog();
}

function showTestResult(result) {
  if (!result) {
    setTestResult("error", text.testFailure.replace("{error}", text.testUnknown));
    return;
  }
  if (result.ok) {
    setTestResult(
      "ok",
      text.testSuccess
        .replace("{ip}", result.exitIp || text.unknown)
        .replace("{region}", result.region || text.unknown)
        .replace("{latency}", String(result.latency ?? "?")),
    );
    return;
  }
  setTestResult("error", text.testFailure.replace("{error}", testErrorText(result)));
}

async function testDialogProxy() {
  const context = dialogContext;
  if (!context || context.testing || context.saving) return;
  const values = dialogValues();
  if (showValidationError(validationError(values, false))) return;
  context.testAbort?.abort();
  context.testGuard.cancel();
  context.lastTest = null;
  clearTestResult();
  setTestResult("", text.testing);
  context.testing = true;
  setDialogBusy(true);
  const guard = context.testGuard;
  const tokenForTest = guard.begin();
  const controller = new AbortController();
  context.testAbort = controller;
  try {
    const data = context.mode === "edit"
      ? await api(`api/proxies/${encodeURIComponent(context.id)}/test`, {
          method: "POST",
          body: payloadFor(values),
          signal: controller.signal,
        })
      : await api("api/proxies/test", {
          method: "POST",
          body: payloadFor(values),
          signal: controller.signal,
        });
    if (dialogContext !== context || !guard.isCurrent(tokenForTest) || !byId("proxy-dialog").open) {
      return;
    }
    context.lastTest = {
      fingerprint: proxyFingerprint(values),
      ok: Boolean(data?.ok),
      result: data?.result || null,
    };
    if (data?.proxy) replaceProxy(data.proxy);
    renderProxies();
    showTestResult(data?.result);
  } catch (error) {
    if (error?.name === "AbortError") return;
    if (dialogContext !== context || !guard.isCurrent(tokenForTest) || !byId("proxy-dialog").open) {
      return;
    }
    context.lastTest = null;
    setTestResult("error", text.testFailure.replace("{error}", apiErrorText(error.code)));
  } finally {
    if (dialogContext === context) {
      context.testing = false;
      context.testAbort = null;
      if (byId("proxy-dialog").open) setDialogBusy(false);
    }
  }
}

async function saveProxy() {
  const context = dialogContext;
  if (!context || context.saving) return;
  const values = dialogValues();
  if (showValidationError(validationError(values, true))) return;
  context.saving = true;
  setFormError("");
  setDialogBusy(true);
  try {
    const payload = payloadFor(values);
    const data = context.mode === "edit"
      ? await api(`api/proxies/${encodeURIComponent(context.id)}`, { method: "PATCH", body: payload })
      : await api("api/proxies", { method: "POST", body: payload });
    if (!data?.proxy) {
      const error = new Error("invalid response");
      error.code = "internal";
      throw error;
    }
    const saved = data.proxy;
    const lastTest = context.lastTest;
    const testedValues = lastTest && lastTest.ok && lastTest.fingerprint === proxyFingerprint(values);
    if (context.mode === "edit") cancelRowTest(context.id);
    replaceProxy(saved);
    if (byId("proxy-dialog").open) closeProxyDialog();
    renderProxies();
    // A dialog test checks the draft connection. After Save, run the real row
    // test so the list reflects the saved revision.
    if (testedValues && saved.status !== "ok") testRowProxy(saved.id);
  } catch (error) {
    if (dialogContext === context && byId("proxy-dialog").open) {
      setFormError(apiErrorText(error.code));
      context.saving = false;
      setDialogBusy(false);
    }
  }
}

function askDelete(proxy) {
  const dialog = byId("confirm-dialog");
  if (dialog.open) return;
  const target = confirmController.ask(proxy.id, proxy.name);
  confirmKind = "proxy";
  pendingIdentity = null;
  byId("confirm-title").textContent = text.deleteTitle;
  byId("confirm-copy").textContent = text.deleteCopy.replace("{name}", target.name);
  byId("confirm-action").textContent = text.deleteConfirm;
  setConfirmError("");
  setConfirmBusy(false);
  dialog.showModal();
}

function setConfirmBusy(busy) {
  byId("confirm-action").disabled = busy;
  byId("confirm-cancel").disabled = busy;
  byId("confirm-close").disabled = busy;
}

function cleanupConfirmDialog() {
  if (!deleting) confirmController.cancel();
  confirmKind = "proxy";
  pendingIdentity = null;
  setConfirmError("");
  setConfirmBusy(false);
}

function closeConfirmDialog() {
  const dialog = byId("confirm-dialog");
  if (dialog.open) dialog.close();
  else cleanupConfirmDialog();
}

async function confirmDelete() {
  if (deleting) return;
  const target = confirmController.peek();
  if (!target) return;
  if (confirmKind === "identity") {
    const account = pendingIdentity;
    confirmKind = "proxy";
    pendingIdentity = null;
    confirmController.take(target.id);
    if (byId("confirm-dialog").open) byId("confirm-dialog").close();
    if (account) await clearIdentity(account);
    return;
  }
  deleting = true;
  setConfirmBusy(true);
  setConfirmError("");
  try {
    await api(`api/proxies/${encodeURIComponent(target.id)}`, { method: "DELETE" });
    confirmController.take(target.id);
    cancelRowTest(target.id);
    proxies = proxies.filter((item) => item.id !== target.id);
    deleting = false;
    if (byId("confirm-dialog").open) byId("confirm-dialog").close();
    else cleanupConfirmDialog();
    renderProxies();
  } catch (error) {
    deleting = false;
    if (byId("confirm-dialog").open) {
      setConfirmError(apiErrorText(error.code));
      setConfirmBusy(false);
    } else {
      confirmController.cancel();
    }
  }
}

applyText();
byId("tab-providers").addEventListener("click", () => selectTab("providers"));
byId("tab-proxies").addEventListener("click", () => selectTab("proxies"));
byId("retry").addEventListener("click", () => location.reload());
byId("add-proxy").addEventListener("click", () => openProxyDialog());
byId("add-proxy-empty").addEventListener("click", () => openProxyDialog());
// Save is wired to a plain click, not to form submission. magpie hosts page
// plugins in <iframe sandbox="allow-scripts"> with no allow-forms, so the
// browser blocks form submission before a submit event can fire and a
// type="submit" button never reaches saveProxy(). The dialog must not depend on
// implicit submission either; keep the explicit click below as the real path.
byId("save-proxy").addEventListener("click", () => {
  saveProxy();
});
// Kept for a normal (non-sandboxed) browser, where pressing Enter in the form
// still submits. The button is type="button" now, so clicking it does not
// double-trigger this path, and saveProxy() guards re-entry via context.saving.
byId("proxy-form").addEventListener("submit", (event) => {
  event.preventDefault();
  saveProxy();
});
byId("test-proxy").addEventListener("click", testDialogProxy);
byId("proxy-cancel").addEventListener("click", closeProxyDialog);
byId("proxy-close").addEventListener("click", closeProxyDialog);
byId("proxy-dialog").addEventListener("close", cleanupProxyDialog);
byId("proxy-form").addEventListener("input", () => {
  if (!dialogContext) return;
  dialogContext.lastTest = null;
  if (dialogContext.testing) {
    cancelDialogTest();
    setDialogBusy(false);
  }
  clearTestResult();
});
byId("confirm-cancel").addEventListener("click", () => {
  confirmController.cancel();
  closeConfirmDialog();
});
byId("confirm-close").addEventListener("click", () => {
  confirmController.cancel();
  closeConfirmDialog();
});
byId("confirm-action").addEventListener("click", confirmDelete);
byId("confirm-dialog").addEventListener("close", cleanupConfirmDialog);
byId("confirm-dialog").addEventListener("cancel", (event) => {
  if (deleting) event.preventDefault();
});
window.addEventListener("pagehide", () => {
  for (const id of [...rowTests.keys()]) cancelRowTest(id);
  cancelDialogTest();
  stopEnvironmentPolling();
  stopSignInPolling();
  stopScorePolling();
});
byId("filter-reset").addEventListener("click", resetProxyFilters);
byId("filter-latency-min").addEventListener("input", () => {
  proxyFilter.minLatency = byId("filter-latency-min").value;
  renderProxies();
});
byId("filter-latency-max").addEventListener("input", () => {
  proxyFilter.maxLatency = byId("filter-latency-max").value;
  renderProxies();
});
byId("score-cancel").addEventListener("click", cancelScore);
byId("environment-prepare").addEventListener("click", prepareEnvironment);
byId("environment-cancel").addEventListener("click", cancelEnvironment);
byId("environment-retry").addEventListener("click", prepareEnvironment);
byId("signin-start").addEventListener("click", startSignIn);
byId("signin-cancel").addEventListener("click", cancelSignIn);
byId("identities-retry").addEventListener("click", loadAccountIdentities);
byId("signin-close").addEventListener("click", closeSignInDialog);
byId("signin-close-footer").addEventListener("click", closeSignInDialog);
byId("signin-dialog").addEventListener("close", cleanupSignInDialog);
// Escape closes the dialog natively; intercept so a running flow is cancelled
// first instead of being left invisible in the background.
byId("signin-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeSignInDialog();
});

load();
