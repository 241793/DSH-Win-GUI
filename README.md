# DeepSeek Harness 桌面端

基于 Electron 的 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) Windows 桌面启动器。它不重新实现 Harness，而是把官方 `dsh web` 服务包装成一个**双击即开、缺组件自动下载安装**的桌面程序，并在此基础上提供互联渠道、插件市场、插件安装等增强功能。

> 官方 CLI：`@deepseek-ai/dsh`（`dsh` 命令）。本项目是官方预留 Electron 壳形态的实用实现：Electron 主进程负责检测、安装、拉起后端，窗口加载官方 Web UI。

---

## 1. 功能特性

### 1.1 基础启动器

- **双击即开**：单实例锁，重复双击只会聚焦已开窗口。
- **自动检测**：启动时检测 Node.js（≥ 22.5.0）、npm、dsh（`@deepseek-ai/dsh`）、Web 前端资源。
- **缺组件一键安装**：未安装时显示引导页，「下载并安装」按钮会自动：
  1. 没有可用 Node.js 时，从 npmmirror 下载便携版 Node.js（免管理员权限）；
  2. 用 npm 从 npmmirror 安装 `@deepseek-ai/dsh` 到应用自管目录（优先复用全局已装的 dsh）；
  3. 实时显示下载进度与 npm 日志。
- **启动 Harness**：拉起 `dsh web --port 0`，解析真实端口，把窗口导航到 `http://127.0.0.1:<端口>`。
- **退出清理**：应用退出时 `taskkill /T /F` 清理后端进程树。
- **检查 DSH 更新**：菜单栏「检查DSH更新」，从 npmmirror 获取最新版本，有新版本弹窗询问是否更新；点击「立即更新」后会弹出独立的「DSH 更新进度」窗口实时显示 npm 安装日志，更新完成后自动重启 dsh web。
- **CC-TUI 终端修复**：菜单栏「帮助」旁的「CC-TUI」或启动报错页的「CC-TUI 终端修复」按钮，会检测是否已安装 [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI)（支持 `cc-tui` / `tui` 两种 profile，且会校验是否真正挂载了 `dsh-cc-tui` bundle）；未安装或历史 `dsh-tui` 包损坏则自动安装（优先 npmmirror 的 `dsh-cc-tui` 包，失败时回退 GitHub tarball）并显示进度，已安装则打开系统终端里的 `dsh --profile cc-tui` 原生交互界面，方便 dsh web 报错时通过终端排查修复。

### 1.2 互联（渠道对接，集成在 Harness Web UI）

启动桌面端后，打开 Harness 界面「设置 → 互联」即可管理聊天渠道：

- **QQ Bot**：一键安装 `@tencent-connect/dsh-qqbot` 到 `qqbot` profile，一键启动并扫码绑定；显示已连接机器人信息（昵称 / Bot ID / AppID）。
- **WxClaw（微信）**：内置自研 `dsh-wxclaw` 插件，使用微信 ilink Bot API（`https://ilinkai.weixin.qq.com`）扫码绑定微信账号；微信发消息给该账号，dsh 接收并回复。
- **账号管理**：每个渠道支持「账号」弹窗查看已绑定账号，并支持删除 / 切换账号。
- **卸载**：每个渠道支持一键卸载（`dsh plugin remove` 或删除自管目录）。
- **自动连接**：已绑定凭据的渠道在应用启动后自动上线，无需手动启动。

### 1.3 插件市场（Harness Web UI → 设置 → 插件市场）

- 从 `https://www.dshplugin.store/` 拉取插件列表（首页 HTML 解析，sitemap 兜底）。
- 支持搜索、分类筛选、已安装筛选。
- 每个插件显示名称、作者、介绍、star、分类，并提供：
  - **GitHub** 按钮：打开插件源码仓库；
  - **安装 / 卸载**：自动解析安装命令并执行 `dsh plugin add/remove`，安装完成后自动重启 dsh web 生效；
  - client-only 插件自动写入 profile 入口行，确保被 dsh 识别。

### 1.4 插件安装（Harness Web UI → 设置 → 插件 → 插件安装 Tab）

官方「插件」设置页新增「插件安装」Tab：

- **本地导入**：选择本地插件文件夹（或 package.json），自动安装到 dsh 插件位置。
- **链接安装**：输入插件链接（一般 GitHub 地址）→「查看」弹出插件信息 →「下载安装」。GitHub 仓库通过官方 tarball 下载到本地再安装，**不依赖 git**。
- **本界面安装列表**：展示通过该 Tab 安装的插件，支持查看信息与删除。

### 1.5 打包分发

- electron-builder 输出 NSIS 安装包（可选安装目录、创建桌面/开始菜单快捷方式）。
- 应用图标、窗口图标、安装包图标、快捷方式图标统一使用 `assets/icon.ico` / `assets/icon.png`。

---

## 2. 实现原理

### 2.1 整体架构

```
┌────────────────────────────────────────────────────────┐
│                    Electron 主进程                        │
│                                                         │
│  main.js           窗口/单实例/菜单/IPC/生命周期/更新检查  │
│  detector.js       检测 Node、npm、dsh、前端资源           │
│  installer.js      下载便携 Node、npm 安装 dsh             │
│  backend.js        spawn "dsh web --port 0" 并探活        │
│  channels.js       互联渠道管理（QQBot / WxClaw）          │
│  marketplace.js    插件市场（dshplugin.store 抓取/解析）    │
│  plugin-install.js 插件安装 Tab（本地导入/链接安装/历史）    │
│  util.js           版本比较、命令执行、下载、解压等工具      │
└──────┬──────────────────────────┬──────────────┬─────────┘
       │ IPC (contextBridge)     │ spawn        │ spawn
       ▼                         ▼              ▼
  preload.js                dsh web 后端    渠道进程（dsh --profile ...）
  renderer/                 (Web UI 3080)   qqbot / wxclaw
  启动/检测/安装页              ▲
       │                      │
       │   dsh 设置页插件（src/connect-plugin，复制为 dsh-connect-center）
       │   注册：设置 → 互联 / 插件市场 / 插件 → 插件安装 Tab
       │   window.desktopAPI.connect / market / pluginInstall
       └── 检测通过后 win.loadURL(http://127.0.0.1:<端口>)
```

### 2.2 启动流程

1. 双击 exe → `app.requestSingleInstanceLock()` 防重复打开。
2. 显示启动页 → 渲染层通过 IPC 调用 `detect-harness`。
3. 主进程执行 `detector.detectAll()`：
   - 探测系统 Node（PATH 找 `node`，再查常见安装目录）；
   - 探测应用自管便携 Node（`userData/runtime/node` 下递归找 `node.exe`）；
   - 选一个可用 Node（优先系统，其次自管）；
   - 用 `npm prefix -g`、PATH 目录扫描、`.npmrc`、`%APPDATA%\npm` 等多路策略定位 dsh；
   - 检查 `<prefix>\node_modules\@deepseek-ai\dsh\lib\bin.js` 与前端 dist。
4. **检测通过** → 渲染层调用 `start-harness` → `backend.js` 拉起后端并导航。
5. **检测不通过** → 渲染层显示缺项列表和「下载并安装」按钮。

### 2.3 后端与插件装载

- `dsh web --port 0` 让系统分配空闲端口，解析 stdout 中 `dsh web: http://127.0.0.1:<端口>` 得到真实地址。
- 启动后端前，`backend.js` 会把内置的 `dsh-connect-center` UI 插件复制到
  `~/.dsh/profiles/web/node_modules/dsh-connect-center`，并加入 web profile 的 bundles，
  这样官方 Web UI 才会出现「互联」「插件市场」和「插件安装」Tab。

### 2.4 互联渠道原理

- `channels.js` 统一管理渠道的安装 / 启动 / 停止 / 切换账号 / 卸载 / 账号查看。
- 渠道定义在 `CHANNELS` 数组：QQ Bot 为 `dsh-profile` 型（安装官方 npm 插件），
  WxClaw 为内置 `dsh-wxclaw` 本地插件。
- WxClaw 插件（`plugins/dsh-wxclaw/`）是参照 QQ Bot 插件写的 Cordis 插件：
  - 未配置 token 时，调用微信 ilink Bot API 的 `get_bot_qrcode`（`GET /ilink/bot/get_bot_qrcode?bot_type=3`）显示二维码；
  - 轮询 `get_qrcode_status?qrcode=<ticket>` 直到扫码成功，拿到 token/botId 并持久化到 profile；
  - 轮询 `getupdates` 拉取微信消息，交给 dsh agent；
  - 监听 `session/event`，通过 `sendmessage` 把 dsh 回复发回微信（支持 context_token 24h 回复窗口）。
- 渠道进程的 stdout/stderr 实时回传 Web UI，二维码、绑定状态、账号信息均在界面展示。

### 2.5 插件市场与插件安装原理

- **插件市场**：`marketplace.js` 抓取 `dshplugin.store` 首页 HTML，用正则解析插件卡片
  （名称、作者、仓库、简介、star、分类）；失败时用 sitemap.xml 兜底。
  安装时抓取插件详情页，解析 `dsh plugin --profile <profile> add <spec>` 命令并执行。
  client-only 插件（无 `dsh.bundle`）自动往 web profile 的 `cordis.patch.yml` 写入
  `insert` 入口行，让 `dsh-client-modules` 能发现其 `dsh.client`。
- **插件安装 Tab**：`plugin-install.js` 负责：
  - 本地导入：Electron 文件选择框 → `dsh plugin --profile web add <本地路径>`；
  - 链接安装：GitHub 仓库先下载官方 tarball 到 `~/.dsh/plugin-tarballs/`，再
    `dsh plugin add <本地.tgz>`，避免依赖 git；
  - 历史记录：`~/.dsh/plugin-install-history.json`，可查看信息、删除（`dsh plugin remove`）。
- 安装 / 卸载完成后，主进程自动重启 dsh web 后端并刷新窗口，使插件立即生效。

---

## 3. 使用方法

### 3.1 开发运行

```powershell
cd D:\Python\开发\harness
npm install
npm start
```

国内网络加速：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
npm install --registry=https://registry.npmmirror.com
```

也可以直接双击仓库根目录的 `启动桌面端.cmd`（优先启动 `dist\win-unpacked` 打包版；不存在时自动装依赖并 `npm start`）。

### 3.2 打包

```powershell
cd D:\Python\开发\harness
npm run dist
```

产物在 `dist\`：

| 文件 | 说明 |
|---|---|
| `DeepSeek Harness-Setup-0.1.0.exe` | NSIS 安装包，可分发 |
| `win-unpacked\DeepSeek Harness.exe` | 免安装版，可直接双击运行 |

> 本项目仓库已内置 `installer.nsi`（带图标、快捷方式、注册表卸载信息）。如需完全由
> electron-builder 重新生成，请设置 `ELECTRON_BUILDER_BINARIES_MIRROR` 后执行 `npm run dist`。

### 3.3 使用打包版

**方式 A：安装包（推荐）**

1. 双击 `DeepSeek Harness-Setup-0.1.0.exe`；
2. 选择安装目录；
3. 安装完成后双击桌面「DeepSeek Harness」图标启动。

**方式 B：免安装版**

1. 把 `win-unpacked` 整个文件夹拷到任意位置；
2. 双击 `DeepSeek Harness.exe`；
3. 可右键 → 发送到 → 桌面快捷方式。

### 3.4 使用互联（QQ Bot / WxClaw）

1. 启动桌面端，进入 Harness Web 界面。
2. 打开「设置 → 互联」。
3. 在渠道卡片上点「安装到 dsh profile」（WxClaw 会自动安装内置插件）。
4. 点「启动并扫码绑定」，按提示扫码：
   - QQ Bot：手机 QQ 扫码；
   - WxClaw：微信扫码。
5. 绑定成功后即可通过对应渠道与 dsh 对话；已绑定账号会在应用启动后自动上线。
6. 「账号」弹窗可查看 / 删除 / 切换已绑定账号；「卸载」可移除渠道。

### 3.5 使用插件市场 / 插件安装

- **插件市场**：`设置 → 插件市场`，搜索 / 分类 / 安装 / 卸载 / 打开 GitHub。
- **插件安装**：`设置 → 插件 → 插件安装`，本地导入或粘贴 GitHub 链接安装。

---

## 4. 数据存放位置

- **dsh profile / 会话数据**：`C:\Users\<用户名>\.dsh`（与官方 CLI 共用）。
- **应用自管运行时**（检测不到全局 Node/dsh 时创建）：`<Electron userData>\runtime\`。
- **插件安装 Tab 的 tarball**：`~/.dsh\plugin-tarballs\`。
- **插件安装 Tab 的历史记录**：`~/.dsh\plugin-install-history.json`。
- **外观等 UI 偏好**：浏览器 localStorage（Harness 页面内）。

---

## 5. 常见情况与处理

| 现象 | 原因 | 处理 |
|---|---|---|
| 启动页长时间停在「正在启动」 | dsh web 首次初始化较慢 | 等 30 秒；失败会显示错误日志 |
| 提示 Node.js 版本过低 | 系统 Node < 22.5.0 | 点「下载并安装」，应用自管便携 Node |
| 检测不到已安装的 dsh | npm 全局 prefix 不在默认位置 | 已做 PATH/`.npmrc`/`%APPDATA%\npm` 多路兜底；仍失败点「下载并安装」 |
| 下载慢 | 默认 npmmirror | 检查网络，可改 `src/main/installer.js` 的 `NPMMIRROR` |
| SmartScreen 提示 | 安装包未签名 | 点「更多信息 → 仍要运行」；正式分发建议签名 |
| 双击第二次没反应 | 单实例锁 | 属正常现象，窗口会被聚焦 |
| 插件市场加载慢 | dshplugin.store 首页较大 | 稍等；失败会自动用 sitemap 兜底 |
| 插件安装后不生效 | 未重启 dsh web / client-only 未写入口行 | 当前版本已自动重启并写入口行；如仍不生效发日志 |
| WxClaw 收不到消息 | 未绑定 / token 失效 / 网络问题 | 在「账号」中删除后重新扫码；查看渠道日志 |
| 快捷方式图标不显示自定义图标 | Windows 图标缓存 | 重启资源管理器或注销重登；安装包和 exe 已内嵌图标 |

---

## 6. 源码目录说明

```
harness/
├─ package.json               # 项目元信息、scripts（start / dist）
├─ electron-builder.yml       # electron-builder 配置（NSIS、图标、electronDist）
├─ installer.nsi              # NSIS 安装脚本（图标、快捷方式、卸载注册表）
├─ 启动桌面端.cmd              # 双击启动脚本（优先打包版）
├─ README.md                  # 本文档
├─ VERSION.md                 # 本版本说明
├─ assets/
│  ├─ icon-source.svg         # 鲸鱼 SVG 源图标
│  ├─ icon.png                # 256×256 PNG（窗口/页面 logo）
│  ├─ icon.ico                # Windows 多尺寸图标（exe/安装包/快捷方式）
│  └─ icon-multi.ico          # 多尺寸 ICO 生成副本
├─ plugins/
│  └─ dsh-wxclaw/             # 内置 WxClaw 微信渠道插件（dsh Cordis 插件）
│     ├─ package.json
│     ├─ cordis.patch.yml
│     └─ dist/index.js
└─ src/
   ├─ main/                   # Electron 主进程
   │  ├─ main.js              # 入口：窗口、菜单（检查DSH更新/CC-TUI/帮助）、IPC、生命周期
   │  ├─ detector.js          # 环境检测
   │  ├─ installer.js         # 一键安装 Node/dsh
   │  ├─ backend.js           # dsh web 后端启动/停止 + 装载 dsh-connect-center
   │  ├─ channels.js          # 互联渠道管理（QQBot/WxClaw/账号/切换/卸载）
   │  ├─ marketplace.js       # 插件市场抓取/解析/安装/卸载
   │  ├─ plugin-install.js    # 插件安装 Tab：本地导入/链接安装/历史
   │  └─ util.js              # 工具函数
   ├─ connect-plugin/         # dsh 设置页插件（复制为 dsh-connect-center）
   │  ├─ package.json
   │  ├─ cordis.patch.yml
   │  └─ lib/
   │     ├─ index.js          # 主机端 no-op
   │     └─ client.js         # 浏览器端：注册 互联 / 插件市场 / 插件安装 Tab
   ├─ preload/
   │  └─ preload.js           # contextBridge：file: 全量 API；127.0.0.1 暴露 connect/market/pluginInstall
   └─ renderer/               # 启动页 UI（connect.html/connect.js 为历史遗留，当前菜单已不入口）
      ├─ index.html / renderer.js / styles.css
      ├─ cc-tui-progress.html / cc-tui-progress.js   # CC-TUI 安装进度窗口
      ├─ connect.html / connect.js
```

---

## 7. 开源说明

- License：MIT。
- 本项目为 DeepSeek Harness 的桌面壳与增强插件集，Harness 本体版权归
  [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 所有。
- WxClaw 微信接口版权归微信 / ilink 平台所有，仅供个人学习与合规使用。
