# dsh-connect-center

DeepSeek Harness connect center settings plugin. Adds three sections to the dsh web settings UI:

- **互联** (Connect): manage IM channel profiles (QQ Bot, WxClaw) — install, start/stop, bind QR, account list, switch/uninstall.
- **插件市场** (Plugin Marketplace): browse, search, install and uninstall plugins from [dshplugin.store](https://www.dshplugin.store/).
- **插件安装** (Plugin Installer, under `设置 → 插件`): import a local plugin folder or install from a GitHub link.

> This plugin is designed to run inside the DeepSeek Harness desktop app, where
> `window.desktopAPI` bridges to the Electron main process. In a pure browser
> environment the sections render but channel/market actions are unavailable.

## Install

```bash
dsh plugin --profile web add dsh-connect-center
dsh web
```

## License

MIT
