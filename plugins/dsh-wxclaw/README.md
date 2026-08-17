# dsh-wxclaw

WxClaw (ilink Bot) WeChat channel plugin for [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (dsh).

Scan a QR code to bind a WeChat account, then chat with dsh through WeChat: incoming WeChat messages are forwarded to the dsh agent, and dsh replies are sent back to WeChat.

## Install

```bash
dsh plugin --profile wxclaw add dsh-wxclaw
dsh --profile wxclaw
```

On first boot the plugin prints a WeChat QR code (and a clickable link). Scan it with WeChat to bind the bot account. Credentials are saved to the profile automatically.

## Configuration

Defaults work out of the box with the official ilink Bot API (`https://ilinkai.weixin.qq.com`).

Optional overrides in the profile `cordis.patch.yml`:

```yaml
- id: im-wxclaw
  config:
    apiUrl: https://ilinkai.weixin.qq.com
    token: ""            # leave empty to scan QR on next boot
    xWechatUin: ""
    pollIntervalSec: 2
    textChunkLimit: 4000
    provider: ""         # LLM provider override
    model: ""            # LLM model override
```

## License

MIT
