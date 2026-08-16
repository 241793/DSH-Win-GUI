# DeepSeek Harness 桌面端

基于 Electron 的 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 桌面启动器。它不是重新实现 Harness，而是把官方 `dsh web` 服务包装成一个**双击即开、缺组件自动下载安装**的 Windows 桌面程序。

> 官方 CLI：`@deepseek-ai/dsh`（`dsh` 命令）。本项目的定位是官方预留的 Electron 壳形态的实用实现：Electron 主进程负责检测、安装、拉起后端，窗口加载官方 Web UI。

---

## 1. 功能特性

- **双击即开**：单实例锁，重复双击只会聚焦已开窗口。
- **自动检测**：启动时检测 Node.js（≥ 22.5.0）、npm、dsh（`@deepseek-ai/dsh`）、Web 前端资源。
- **缺组件一键安装**：未安装时显示引导页，「下载并安装」按钮会自动：
  1. 没有可用 Node.js 时，从 npmmirror 下载便携版 Node.js（免管理员权限）；
  2. 用 npm 从 npmmirror 安装 `@deepseek-ai/dsh` 到应用自管目录（优先复用全局已装的 dsh）；
  3. 实时显示下载进度与 npm 日志。
- **启动 Harness**：拉起 `dsh web --port 0`，解析真实端口，把窗口导航到 `http://127.0.0.1:<端口>`，同一窗口变成 DeepSeek Harness 界面。
- **退出清理**：应用退出时 `taskkill /T /F` 清理后端进程树。
- **可打包分发**：electron-builder 输出 NSIS 安装包（可选安装目录、创建桌面/开始菜单快捷方式、带图标和版本信息）。
- **互联中心（渠道对接）**：以 dsh 设置页插件的形式集成进 Harness Web UI——启动桌面端后，
  打开 Harness 界面「设置 → 互联」即可管理渠道。以 QQ Bot 为例：一键执行
  `dsh plugin --profile qqbot add @tencent-connect/dsh-qqbot` 安装到 profile，再一键启动
  `dsh --profile qqbot`，首次启动的二维码直接显示在设置页输出区，手机 QQ 扫码绑定后即可通过 QQ 与 dsh 对话。
  （保留菜单栏「互联 → 互联中心」作为独立窗口备用入口。）

---

## 2. 实现原理

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    Electron 主进程                    │
│                                                      │
│  main.js        窗口/单实例/IPC/菜单/生命周期         │
│  detector.js    检测 Node、npm、dsh、前端资源          │
│  installer.js   下载便携 Node、npm 安装 dsh            │
│  backend.js     spawn "dsh web --port 0" 并探活       │
│  channels.js    渠道插件安装/启动/停止（IPC 桥接到设置页）│
│  util.js        版本比较、命令执行、下载、解压等工具     │
└──────┬────────────────────────┬──────────────┬────────┘
       │ IPC (contextBridge)    │ spawn        │ spawn
       ▼                        ▼              ▼
  preload.js              dsh web 后端    dsh --profile qqbot
  renderer/                (Web UI)         (QQ Bot 渠道，
  启动/检测/安装页          127.0.0.1:随机    stdout 显示二维码)
  互联中心(connect.html)     端口
       │                        ▲
       │    dsh 设置页「互联」插件（src/connect-plugin）
       │    window.desktopAPI.connect → IPC → channels.js
       └──── 检测通过后 ────────┘
          win.loadURL(http://127.0.0.1:<端口>)
```

### 2.2 启动流程

1. 双击 exe → `app.requestSingleInstanceLock()` 防重复打开。
2. 显示启动页 → 渲染层通过 IPC 调用 `detect-harness`。
3. 主进程执行 `detector.detectAll()`：
   - 探测系统 Node（PATH 找 `node`，再查常见安装目录）；
   - 探测应用自管便携 Node（`userData/runtime/node` 下递归找 `node.exe`）；
   - 选一个可用 Node（优先系统，其次自管）；
   - 用 `npm prefix -g`、PATH 目录扫描、`.npmrc`、`%APPDATA%\npm` 等多路策略定位 dsh 全局 prefix；
   - 再查应用自管 prefix；
   - 检查 `<prefix>\node_modules\@deepseek-ai\dsh\lib\bin.js` 与
     `<prefix>\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-web-frontend\dist\index.html`。
4. **检测通过** → 渲染层调用 `start-harness` → `backend.js` 拉起后端并导航。
5. **检测不通过** → 渲染层显示缺项列表和「下载并安装」按钮。

### 2.3 检测原理（detector.js）

Node 检测：
- `node -v` 取版本，要求 ≥ `MIN_NODE_VERSION`（22.5.0，因为 dsh 依赖 `node:sqlite`）；
- `node -e "process.stdout.write(process.execPath)"` 取真实路径；
- 根据 node 路径定位 `node_modules/npm/bin/npm-cli.js`，用 `node npm-cli.js -v` 验证 npm。

dsh 检测（多路兜底，避免 `npm root -g`/prefix 与实际安装位置不一致）：
1. `npm prefix -g` 返回的全局 prefix；
2. 遍历 `PATH` 中每个目录，检查 `<dir>\node_modules\@deepseek-ai\dsh\lib\bin.js`；
3. 读取用户 `.npmrc` / 全局 npmrc 中配置的 `prefix`；
4. `%APPDATA%\npm`（Windows 默认全局 prefix）；
5. 应用自管 prefix：`<userData>\runtime\prefix`。

### 2.4 安装原理（installer.js）

- **选 Node**：系统 Node 可用则用系统的；否则若自管便携 Node 可用则用自管的；都没有就从
  `https://registry.npmmirror.com/-/binary/node/v24.19.0/node-v24.19.0-win-x64.zip`
  下载便携版并解压到 `<userData>\runtime\node`（zip 解压后递归查找 `node.exe`）。
- **找 dsh**：优先复用全局已装的 dsh；没有则用 `node npm-cli.js install --prefix <userData>\runtime\prefix --registry=https://registry.npmmirror.com @deepseek-ai/dsh@latest` 安装到应用自管目录。
- 安装过程通过 `install-progress` IPC 事件实时回传日志与下载进度。

### 2.5 后端启动原理（backend.js）

- 不用默认端口，而是 `dsh web --port 0` 让系统分配空闲端口，避免冲突。
- `spawn(nodePath, [dshBinPath, 'web', '--port', '0'])`，监听 stdout 中的
  `dsh web: http://127.0.0.1:<端口>` 得到真实地址。
- 用 `fetch` 探活（HTTP 200/非 5xx 视为就绪），超时或子进程退出则收集 stderr 报错。
- 退出时 Windows 下用 `taskkill /pid <pid> /T /F` 杀进程树。

### 2.6 窗口与安全（main.js / preload.js）

- 启动页：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- `preload.js` 只在 `file:` 协议（启动页）下通过 `contextBridge` 暴露 `window.desktopAPI`；
  Harness 页面（`http://127.0.0.1`）不暴露该 API。
- `setWindowOpenHandler` 与 `will-navigate`：外部链接交给系统浏览器，只允许导航到
  启动页（file:）与后端 origin。
- 应用退出（`before-quit`）时停止后端。

### 2.7 打包原理（electron-builder.yml）

- `electron-builder --win nsis` 生成 NSIS 安装包。
- `electronDist: node_modules/electron/dist`：直接使用本地 Electron 发行版，避免打包时重新下载 Electron。
- `npmRebuild: false`：本项目没有原生生产依赖，跳过 rebuild。
- 镜像：打包时设置 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`
  即可从国内镜像下载 winCodeSign / nsis 组件（不设置则走 GitHub）。
- `win.icon: assets/icon.ico`：应用图标与安装包图标。
- NSIS 选项：`oneClick: false`、`allowToChangeInstallationDirectory: true`、
  `createDesktopShortcut: true`、`createStartMenuShortcut: true`。

### 2.8 互联中心原理（设置页插件 + Electron IPC bridge）

互联中心默认以 **dsh 设置页插件**的形式集成在 Harness Web UI 里（`设置 → 互联`），
这与官方注释里「Electron loads dist over file:// and carries fetch over an IPC bridge」的思路一致：

1. **UI 插件**：`src/connect-plugin/` 是一个 dsh bundle 插件（`dsh-connect-center`）。
   它的 `cordis.patch.yml` 只向 Web 客户端 roster 插入一行 `ui-connect-center`；
   `lib/client.js` 在浏览器端通过 `ctx.slots.inject("settings.section", ...)` 注册
   「互联」设置页 section，用 React 渲染渠道卡片、操作按钮和运行输出区。
2. **自动装入 profile**：`backend.startBackend()` 在启动 `dsh web` 前调用
   `ensureConnectCenterPlugin()`，把打包在 app.asar 里的插件复制到
   `~/.dsh/profiles/web/node_modules/dsh-connect-center`，并把它追加到
   `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles`。
3. **IPC 桥**：设置页插件不直接执行命令，而是调用 `window.desktopAPI.connect.*`。
   我们的 preload 在 `http://127.0.0.1:<端口>`（Harness 后端 origin）上暴露了
   `desktopAPI.connect`（getChannels/install/start/stop/onOutput），渲染层 → 主进程
   `channels.js` 完成实际工作。
4. **安装渠道**：`channels.js` 先确保 dsh 可用（不可用则复用一键安装流程），再确保 pnpm 可用
   （系统没有 pnpm 时用 npm 把 pnpm 装到应用自管目录，并把其 `.bin` 目录注入 `PATH`），
   然后执行官方命令：
   `node <dsh>/lib/bin.js plugin --profile qqbot add @tencent-connect/dsh-qqbot`。
5. **启动渠道**：`channels.js` spawn `node <dsh>/lib/bin.js --profile qqbot`，把 stdout/stderr
   按行回传渲染层。首次启动时 `@tencent-connect/qqbot-connector` 用 `qrcode-terminal`
   把二维码打印到 stdout，设置页用等宽 `<pre>` 原样展示（保留 Unicode 方块和行内空格）。
6. **扫码绑定**：用户用手机 QQ 扫码后，凭据自动保存到 `~/.dsh/profiles/qqbot`，后续启动不再需要扫码。
7. **停止**：`taskkill /T /F` 结束频道进程树；应用退出时也会统一清理。

> 兼容入口：菜单栏「互联 → 互联中心」仍保留一个独立窗口（`connect.html`），
> 作为浏览器打开 dsh web 时无法使用 IPC 桥时的备用界面。

---

## 3. 使用方法

### 3.1 开发运行

```powershell
cd D:\Python\开发\harness
npm install          # 国内网络建议先设置镜像
npm start
```

国内网络加速：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm install --registry=https://registry.npmmirror.com
```

也可以直接双击仓库根目录的 `启动桌面端.cmd`（自动检查 Node、自动装依赖并启动）。

### 3.2 打包

```powershell
cd D:\Python\开发\harness
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run dist
```

产物在 `dist\`：

| 文件 | 说明 |
|---|---|
| `DeepSeek Harness-Setup-0.1.0.exe` | NSIS 安装包，可分发 |
| `win-unpacked\DeepSeek Harness.exe` | 免安装版，可直接双击运行 |

### 3.3 使用打包版

**方式 A：安装包（推荐）**
1. 双击 `DeepSeek Harness-Setup-0.1.0.exe`；
2. 选择安装目录（默认当前用户目录，不需要管理员权限）；
3. 勾选「创建桌面快捷方式」；
4. 安装完成后双击桌面上的 `DeepSeek Harness` 图标启动。

**方式 B：免安装版**
1. 把 `win-unpacked` 整个文件夹拷到任意位置；
2. 双击 `DeepSeek Harness.exe`；
3. 可右键 → 发送到 → 桌面快捷方式。

### 3.4 使用互联中心（QQ Bot 渠道）

1. 启动桌面端，等待 Harness 界面打开。
2. 在 Harness 界面左侧打开「设置」，在设置导航里点「互联」。
3. 在 QQ Bot 卡片上点击「安装到 dsh profile」——会自动确保 Node、dsh、pnpm 可用并执行
   `dsh plugin --profile qqbot add @tencent-connect/dsh-qqbot`，日志实时显示在下方输出区。
4. 安装完成后点击「启动并扫码绑定」——应用执行 `dsh --profile qqbot`，首次启动会在输出区
   打印二维码（Unicode 方块），用**手机 QQ 扫码**完成绑定，凭据自动保存到
   `~/.dsh/profiles/qqbot`。
5. 绑定成功后该进程持续运行，QQ 里即可与机器人对话；不需要时在「互联」页点「停止」。
6. 后续再次启动无需扫码，直接点「启动并扫码绑定」即可上线。

> 备用入口：菜单栏「互联 → 互联中心」仍可打开独立窗口版互联中心。

---

## 4. 打包后运行说明与可能出现的情况

### 4.1 首次启动

- 启动页会先显示「正在检测运行环境…」。
- 如果本机已装 Node.js 和全局 `dsh`，几秒内会自动进入 DeepSeek Harness 界面。
- 如果缺组件，会显示「需要安装运行组件」，点「下载并安装」即可，首次安装依赖需要几分钟（视网络而定），期间不要关闭窗口。

### 4.2 数据存放位置

- **dsh 的 profile / 会话数据**：`C:\Users\<你的用户名>\.dsh`（与官方 CLI 共用）。
- **应用自管运行时**（仅当检测不到全局 Node/dsh 时才会创建）：
  `<用户数据目录>\runtime\`，其中 `node\` 是便携 Node，`prefix\` 是自管安装的 dsh。
- **应用日志/配置**：Electron `userData` 目录（`%APPDATA%` 下）。

### 4.3 常见情况与处理

| 现象 | 原因 | 处理 |
|---|---|---|
| 启动页长时间停在「正在启动」 | dsh web 首次初始化 profile 较慢，或后端启动失败 | 等 30 秒；仍失败会显示错误日志，按日志排查 |
| 提示 Node.js 版本过低 | 系统 Node < 22.5.0（dsh 需要 `node:sqlite`） | 点「下载并安装」，应用会下载便携版 Node 自用，不动系统 Node |
| 检测不到已安装的 dsh | npm 全局 prefix 不在默认位置 | 当前版本已做 PATH 扫描/`.npmrc`/`%APPDATA%\npm` 多路兜底；如仍检测不到，点「下载并安装」即可，应用会装一份自管的 dsh |
| 下载很慢 | 默认走 npmmirror，但网络环境不同 | 检查网络；可修改 `src/main/installer.js` 顶部的 `NPMMIRROR` 常量后重新打包 |
| SmartScreen 提示「已保护你的电脑」 | 安装包未做代码签名 | 点「更多信息 → 仍要运行」；正式分发建议购买代码签名证书 |
| 杀毒软件误报 | Electron + 便携 Node 下载行为可能触发启发式扫描 | 加白名单或换正式签名 |
| 双击第二次没反应 | 单实例锁生效 | 已在运行的窗口会被前置聚焦，属正常现象 |
| 关闭窗口后浏览器界面卡住 | 后端未退出 | 正常情况退出时自动清理；若进程残留，任务管理器结束 `node.exe`（dsh web）即可 |
| 端口冲突 | 默认用 `--port 0` 随机端口 | 理论上不会冲突；若网络策略只放行固定端口，可改 `backend.js` 传 `--port 3080` |
| 互联中心安装插件时报 pnpm 找不到 | 系统未装 pnpm | 应用会自动用 npm 把 pnpm 装到自管目录并注入 PATH，一般无需手动处理；失败则看控制台日志 |
| QQ Bot 二维码显示为乱码/错位 | 输出区字体不是等宽字体，或窗口被缩放 | 控制台已使用 Consolas 等宽字体并保留行内空格；如仍错位，适当拉宽窗口 |
| 扫码后长时间没反应 | 手机 QQ 与电脑网络不通，或二维码已过期 | 二维码过期会自动刷新；确认手机能访问外网，重新扫码即可 |
| QQ Bot 机器人不回复 | 未在 dsh 中配置 LLM 模型/API Key | 在 Harness Web 界面「设置 → 模型」中配置 DeepSeek API Key 后重试 |

### 4.4 网络说明

- 安装器默认从 **npmmirror** 下载 Node 与 dsh 依赖，不依赖 GitHub。
- 打包时若需下载 winCodeSign/nsis 组件，请设置 `ELECTRON_BUILDER_BINARIES_MIRROR`（见 3.2）。
- 运行已装好的 Harness 本身通常不需要外网（除非模型 API 等业务需要）。

---

## 5. 源码目录说明

```
harness/
├─ package.json               # 项目元信息、scripts（start / dist）、devDependencies
├─ electron-builder.yml       # electron-builder 打包配置（NSIS、图标、electronDist 等）
├─ 启动桌面端.cmd              # 开发态双击启动脚本（自动装依赖并 npm start）
├─ .gitignore                 # 忽略 node_modules / dist / 缓存
├─ README.md                  # 本文档
├─ assets/
│  ├─ icon-source.svg         # 官方鲸鱼 SVG 源图标（蓝底白鲸）
│  ├─ icon.png                # 源图标（256×256 PNG）
│  └─ icon.ico                # Windows 图标（由 icon.png 生成，打包使用）
└─ src/
   ├─ main/                   # Electron 主进程
   │  ├─ main.js              # 入口：窗口、单实例锁、菜单、IPC 注册、退出清理
   │  ├─ detector.js          # 运行环境检测：Node/npm/dsh/前端资源，多路兜底定位
   │  ├─ installer.js         # 一键安装：下载便携 Node、npm 安装 @deepseek-ai/dsh、进度回报
   │  ├─ backend.js           # 后端生命周期：spawn dsh web、解析端口、探活、杀进程树
   │  ├─ channels.js          # 互联中心：渠道插件安装/启动/停止、pnpm 确保、输出回传
   │  └─ util.js              # 工具：版本比较、命令执行、下载/解压、找 node.exe、PATH 扫描
   ├─ connect-plugin/         # dsh 设置页插件（dsh-connect-center bundle）
   │  ├─ package.json         # dsh.client + dsh.bundle 声明，exports["./client"]
   │  ├─ cordis.patch.yml     # 插入 ui-connect-center 客户端行
   │  └─ lib/
   │     ├─ index.js          # 主机端 no-op 插件入口
   │     └─ client.js         # 浏览器端：注册「设置 → 互联」section，React UI + IPC 调用
   ├─ preload/
   │  └─ preload.js           # contextBridge 暴露 desktopAPI（file: 全量；127.0.0.1 仅 connect）
   └─ renderer/               # 启动页与互联中心独立窗口 UI（纯 HTML/CSS/JS，无框架）
      ├─ index.html           # 启动页结构：检测中/启动中/安装页/错误页
      ├─ renderer.js          # 启动页逻辑：调 IPC、渲染检测结果、安装进度、日志
      ├─ connect.html         # 互联中心结构：渠道卡片 + 运行输出控制台
      ├─ connect.js           # 互联中心逻辑：安装/启动/停止、二维码输出展示
      └─ styles.css           # 深色主题样式（启动页与互联中心共用）
```

各源码职责速览：

| 文件 | 核心函数/导出 | 作用 |
|---|---|---|
| `src/main/util.js` | `runCapture` / `runNpm` / `downloadFile` / `extractZip` / `findNodeExe` / `findDshPrefixesInPath` / `resolveNpmCli` / `versionAtLeast` | 全部公共工具 |
| `src/main/detector.js` | `detectAll` / `probeNode` / `probeDshPrefix` / `readNpmrcPrefixes` | 检测并返回 `{ ready, node, dsh, missing }` |
| `src/main/installer.js` | `ensureHarness` / `cancelInstall` | 确保 Node + dsh 可用，`report` 回调发进度 |
| `src/main/backend.js` | `startBackend` / `stopBackend` / `probeUrl` / `ensureConnectCenterPlugin` | 启动/停止 dsh web 进程，并把互联中心 UI 插件装入 web profile |
| `src/main/channels.js` | `getChannelsStatus` / `installChannel` / `startChannel` / `stopChannel` / `stopAllChannels` | 互联中心：渠道插件安装/启动/停止 |
| `src/connect-plugin/*` | — | dsh 设置页「互联」插件（bundle + client） |
| `src/main/main.js` | — | 主进程入口，串联以上模块 |
| `src/preload/preload.js` | — | 暴露 `window.desktopAPI`（含 `connect` 子 API） |
| `src/renderer/*` | — | 启动/安装引导界面 + 互联中心界面 |

---

## 6. 开源说明

- License：MIT（见 `LICENSE` 文件；如未包含可自行添加）。
- 本项目仅为 DeepSeek Harness 的桌面启动壳，Harness 本体版权归
  [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 所有。
- 欢迎提交 Issue / PR。修改后请重新执行 `npm run dist` 生成安装包。
