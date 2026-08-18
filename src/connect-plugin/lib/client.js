window.__ModuleLoader__.load({
  id: "dsh-connect-center",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var react = require("react");
    var primitives = require("@deepseek-ai/dsh-client-ui-primitives");

    var CSS = [
      ".dsh-connect{display:flex;flex-direction:column;gap:16px;width:100%;max-width:760px;padding:2px 2px 24px}",
      ".dsh-connect-header{display:flex;flex-direction:column;gap:4px}",
      ".dsh-connect-title{margin:0;font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary)}",
      ".dsh-connect-subtitle{margin:0;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary)}",
      ".dsh-connect-list{display:flex;flex-direction:column;gap:12px}",
      ".dsh-connect-card{display:flex;flex-direction:column;gap:12px;border:1px solid var(--dsw-alias-border);border-radius:16px;padding:16px;background:var(--dsw-alias-bg-layer-2)}",
      ".dsh-connect-card-top{display:flex;align-items:center;gap:10px}",
      ".dsh-connect-logo{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#4d6bfe,#7c3aed);color:#fff;font-weight:700;font-size:16px;flex:none}",
      ".dsh-connect-name{margin:0;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}",
      ".dsh-connect-status{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}",
      ".dsh-connect-desc{margin:0;font-size:13px;line-height:1.7;color:var(--dsw-alias-label-secondary)}",
      ".dsh-connect-botinfo{margin:8px 0 0;font-size:13px;line-height:1.7;color:var(--dsw-alias-success,#34d399);background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.25);border-radius:10px;padding:8px 10px}",
      ".dsh-connect-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}",
      ".dsh-connect-model{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
      ".dsh-connect-model input,.dsh-connect-model select{box-sizing:border-box;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border);color:var(--dsw-alias-label-primary);border-radius:10px;padding:7px 10px;font-size:12px;font-family:inherit;outline:none;width:220px}",
      ".dsh-connect-model input:focus,.dsh-connect-model select:focus{border-color:var(--dsw-alias-accent,#4d6bfe)}",
      ".dsh-connect-spacer{flex:1}",
      ".dsh-connect-log{box-sizing:border-box;width:100%;min-height:160px;max-height:300px;overflow:auto;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border);border-radius:12px;padding:10px 12px;font-family:Consolas,'Sarasa Mono SC','Courier New',monospace;font-size:12px;line-height:1.2;color:var(--dsw-alias-label-primary);white-space:pre;word-break:normal}",
      ".dsh-connect-qr{box-sizing:border-box;width:100%;overflow:auto;background:#fff;border:1px solid var(--dsw-alias-border);border-radius:14px;padding:12px;font-family:Consolas,'Sarasa Mono SC','Courier New',monospace;font-size:11px;line-height:1.1;color:#000;white-space:pre;word-break:normal;display:flex;align-items:center;justify-content:center;min-height:180px}",
      ".dsh-connect-qr-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:180px;color:var(--dsw-alias-label-secondary);font-size:13px}",
      ".dsh-connect-status-row{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-primary);margin:10px 0 0}",
      ".dsh-connect-cmds{margin:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border);border-radius:10px;padding:8px 10px}",
      ".dsh-market{display:flex;flex-direction:column;gap:14px;width:100%;max-width:760px;padding:2px 2px 24px}",
      ".dsh-market-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}",
      ".dsh-market-bar input{box-sizing:border-box;flex:1;min-width:220px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border);color:var(--dsw-alias-label-primary);border-radius:10px;padding:8px 12px;font-size:13px;font-family:inherit;outline:none}",
      ".dsh-market-bar input:focus{border-color:var(--dsw-alias-accent,#4d6bfe)}",
      ".dsh-market-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}",
      ".dsh-market-card{display:flex;flex-direction:column;gap:8px;border:1px solid var(--dsw-alias-border);border-radius:14px;padding:14px;background:var(--dsw-alias-bg-layer-2)}",
      ".dsh-market-name{margin:0;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}",
      ".dsh-market-owner{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary)}",
      ".dsh-market-desc{margin:0;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}",
      ".dsh-market-meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center}",
      ".dsh-market-tag{border:1px solid var(--dsw-alias-border);border-radius:999px;padding:2px 8px;font-size:11px;color:var(--dsw-alias-label-secondary)}",
      ".dsh-market-actions{display:flex;gap:8px;margin-top:auto;flex-wrap:wrap}",
      ".dsh-install{display:flex;flex-direction:column;gap:16px;width:100%;max-width:760px;padding:2px 2px 24px}",
      ".dsh-install-card{display:flex;flex-direction:column;gap:10px;border:1px solid var(--dsw-alias-border);border-radius:14px;padding:14px;background:var(--dsw-alias-bg-layer-2)}",
      ".dsh-install-card h3{margin:0;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}",
      ".dsh-install-card p{margin:0;font-size:13px;color:var(--dsw-alias-label-secondary);line-height:1.6}",
      ".dsh-install-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
      ".dsh-install-row input{box-sizing:border-box;flex:1;min-width:220px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border);color:var(--dsw-alias-label-primary);border-radius:10px;padding:8px 12px;font-size:13px;font-family:inherit;outline:none}",
      ".dsh-install-row input:focus{border-color:var(--dsw-alias-accent,#4d6bfe)}",
      ".dsh-install-item{display:flex;align-items:center;gap:10px;border:1px solid var(--dsw-alias-border);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-bg-layer-1)}",
      ".dsh-install-item .info{flex:1;min-width:0}",
      ".dsh-install-item .name{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}",
      ".dsh-install-item .meta{font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dsh-skill-tabs{display:flex;gap:8px;margin-bottom:12px}",
      ".dsh-skill-tab{border:1px solid var(--dsw-alias-border);border-radius:999px;padding:6px 14px;font-size:13px;color:var(--dsw-alias-label-secondary);background:transparent;cursor:pointer}",
      ".dsh-skill-tab.active{border-color:var(--dsw-alias-accent,#4d6bfe);color:var(--dsw-alias-accent,#4d6bfe)}",
      ".dsh-skill-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}",
      ".dsh-skill-card{display:flex;flex-direction:column;gap:8px;border:1px solid var(--dsw-alias-border);border-radius:14px;padding:14px;background:var(--dsw-alias-bg-layer-2)}",
      ".dsh-skill-name{margin:0;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}",
      ".dsh-skill-desc{margin:0;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary)}",
      ".dsh-skill-meta{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary)}",
      ".dsh-skill-actions{display:flex;gap:8px;margin-top:auto;flex-wrap:wrap}"
    ].join("\n");

    if (typeof document !== "undefined" && !document.querySelector('style[data-plugin-css="dsh-connect-center"]')) {
      var style = document.createElement("style");
      style.dataset.plugin = "dsh-connect-center";
      style.dataset.pluginCss = "dsh-connect-center";
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    var hostApi = null;

    function stripAnsi(text) {
      return String(text || "")
        .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
        .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
    }

    function hasBlockChar(line) {
      return /[▀▄█]/.test(line);
    }

    /** 从最近日志里提取最后一段二维码块（qrcode-terminal 的 Unicode 方块输出）。 */
    function extractQrBlock(lines) {
      var start = -1;
      for (var i = lines.length - 1; i >= 0; i -= 1) {
        if (hasBlockChar(lines[i])) start = i;
        else if (start !== -1) break;
      }
      if (start === -1) return "";
      var block = [];
      for (var j = start; j < lines.length; j += 1) {
        if (!hasBlockChar(lines[j])) break;
        block.push(lines[j]);
      }
      return block.join("\n");
    }

    /** 从最近日志/健康状态推导渠道状态。 */
    function deriveChannelState(channel, lines) {
      var joined = lines.join("\n");
      var running = Boolean(channel && channel.running);

      if (channel && channel.kind === "cli") {
        if (!running && lines.length === 0) return { state: "warning", text: "尚未启动" };
        if (channel.health && channel.health.gateway) {
          var gw = channel.health.gateway;
          if (gw.healthy) return { state: "done", text: "网关 HEALTHY（端口 " + (gw.port || "?") + "）" };
          if (gw.reachable) return { state: "warning", text: "网关 DEGRADED" };
          return { state: "error", text: "网关 UNREACHABLE，守护进程会自动重启" };
        }
        if (/OpenClaw Doctor started/i.test(joined)) return { state: "ongoing", text: "守护进程运行中，正在监控网关…" };
        if (running) return { state: "ongoing", text: "正在启动守护进程…" };
        return { state: "error", text: "守护进程已停止" };
      }

      if (channel && channel.id === "wxclaw") {
        if (!running && lines.length === 0) return { state: "warning", text: "尚未启动" };
        if (/绑定成功|已加载保存的账号|\[im-wxclaw\] started/i.test(joined)) return { state: "done", text: "微信账号已绑定，渠道已上线" };
        if (running && extractQrBlock(lines).length > 0) return { state: "ongoing", text: "等待微信扫码" };
        if (/扫码绑定|等待扫码|get_bot_qrcode/i.test(joined)) return { state: "ongoing", text: "等待微信扫码" };
        if (running) return { state: "ongoing", text: "正在启动渠道进程…" };
        return { state: "error", text: "渠道进程已停止" };
      }

      if (!running && lines.length === 0) return { state: "warning", text: "尚未启动" };
      if (/Bot ready/i.test(joined)) return { state: "done", text: "渠道已上线，QQ Bot 已连接" };
      if (/绑定成功|扫码成功|AppID/i.test(joined)) {
        if (running) return { state: "ongoing", text: "绑定成功，正在启动网关…" };
        return { state: "warning", text: "绑定成功，正在重启渠道…" };
      }
      if (/绑定失败|二维码已过期/i.test(joined)) return { state: "warning", text: "二维码已过期或绑定未完成，正在刷新…" };
      if (running && extractQrBlock(lines).length > 0) return { state: "ongoing", text: "等待手机 QQ 扫码" };
      if (running) return { state: "ongoing", text: "正在启动渠道进程…" };
      return { state: "error", text: "渠道进程已停止" };
    }

    function ModelEditor(props) {
      var create = react.createElement;
      var useState = react.useState;
      var channel = props.channel;
      var options = props.modelOptions || [];
      var recent = props.recentModel;

      var currentValue = (channel.provider && channel.model)
        ? channel.provider + "/" + channel.model
        : (recent && recent.provider && recent.model)
          ? recent.provider + "/" + recent.model
          : (options.length > 0 ? options[0].provider + "/" + options[0].model : "");
      var valueState = useState(currentValue);
      var savingState = useState(false);
      var saving = savingState[0];
      var setSaving = savingState[1];

      var save = function () {
        if (!props.connectApi) return;
        var value = valueState[0].trim();
        if (!value) return;
        var slash = value.indexOf("/");
        var provider = slash >= 0 ? value.slice(0, slash) : '';
        var model = slash >= 0 ? value.slice(slash + 1) : value;
        if (!provider || !model) return;
        setSaving(true);
        props.appendLog(channel.id, "===== 保存默认模型 =====");
        props.connectApi.setModel(channel.id, provider, model).then(function (list) {
          if (list && list.length !== undefined) props.onSaved(list);
          props.appendLog(channel.id, "默认模型已保存：" + provider + " / " + model);
        }).catch(function (error) {
          props.appendLog(channel.id, "[错误] 保存默认模型失败：" + (error && error.message ? error.message : error));
        }).finally(function () {
          setSaving(false);
        });
      };

      if (options.length > 0) {
        return create("div", { className: "dsh-connect-model" },
          create("span", { className: "muted" }, "默认模型"),
          create("select", {
            value: valueState[0],
            onChange: function (event) { valueState[1](event.target.value); },
          }, options.map(function (option) {
            return create("option", {
              key: option.provider + "/" + option.model,
              value: option.provider + "/" + option.model,
            }, (option.groupName || option.provider) + " / " + (option.name || option.model));
          })),
          create(primitives.Button, {
            variant: "outline",
            size: "sm",
            disabled: saving,
            onClick: save,
          }, saving ? "保存中…" : "保存"));
      }

      return create("div", { className: "dsh-connect-model" },
        create("span", { className: "muted" }, "默认模型"),
        create("input", {
          value: valueState[0].split("/")[0] || '',
          placeholder: "provider",
          onChange: function (event) {
            var rest = valueState[0].indexOf("/") >= 0 ? "/" + valueState[0].slice(valueState[0].indexOf("/") + 1) : "";
            valueState[1](event.target.value.trim() + rest);
          },
        }),
        create("input", {
          value: valueState[0].indexOf("/") >= 0 ? valueState[0].slice(valueState[0].indexOf("/") + 1) : '',
          placeholder: "model",
          onChange: function (event) {
            var provider = valueState[0].indexOf("/") >= 0 ? valueState[0].slice(0, valueState[0].indexOf("/")) : 'deepseek-official';
            valueState[1](provider + "/" + event.target.value.trim());
          },
        }),
        create(primitives.Button, {
          variant: "outline",
          size: "sm",
          disabled: saving,
          onClick: save,
        }, saving ? "保存中…" : "保存"));
    }

    function ConnectSection() {
      var create = react.createElement;
      var useState = react.useState;
      var useEffect = react.useEffect;

      var channelsState = useState([]);
      var channels = channelsState[0];
      var setChannels = channelsState[1];
      var busyState = useState({});
      var busy = busyState[0];
      var setBusy = busyState[1];
      var logMapState = useState({});
      var logMap = logMapState[0];
      var setLogMap = logMapState[1];
      var bindIdState = useState(null);
      var bindId = bindIdState[0];
      var setBindId = bindIdState[1];
      var logIdState = useState(null);
      var logId = logIdState[0];
      var setLogId = logIdState[1];
      var updatesState = useState([]);
      var updates = updatesState[0];
      var setUpdates = updatesState[1];
      var modelOptionsState = useState([]);
      var modelOptions = modelOptionsState[0];
      var setModelOptions = modelOptionsState[1];
      var recentModelState = useState(null);
      var recentModel = recentModelState[0];
      var setRecentModel = recentModelState[1];
      var accountChannelState = useState(null);
      var accountChannel = accountChannelState[0];
      var setAccountChannel = accountChannelState[1];

      var desktop = (typeof window !== "undefined" && window.desktopAPI) ? window.desktopAPI : null;
      var connectApi = desktop && desktop.connect ? desktop.connect : null;

      var appendLog = function (channelId, text) {
        setLogMap(function (prev) {
          var next = (prev[channelId] || []).concat(stripAnsi(text));
          if (next.length > 500) next = next.slice(next.length - 500);
          var copy = {};
          for (var key in prev) copy[key] = prev[key];
          copy[channelId] = next;
          return copy;
        });
      };

      var setBusyFor = function (channelId, value) {
        setBusy(function (prev) {
          var copy = {};
          for (var key in prev) copy[key] = prev[key];
          copy[channelId] = value;
          return copy;
        });
      };

      useEffect(function () {
        if (!connectApi) return undefined;
        var disposed = false;
        connectApi.getChannels().then(function (list) {
          if (!disposed) setChannels(list || []);
        }).catch(function (error) {
          if (!disposed) appendLog("system", "[错误] " + (error && error.message ? error.message : error));
        });
        connectApi.checkUpdates().then(function (list) {
          if (!disposed) setUpdates(list || []);
        }).catch(function () { /* 更新检查失败不打扰 */ });

        // 已添加的模型列表（来自 dsh llm.models 目录）。
        if (hostApi && hostApi.llm && hostApi.llm.models) {
          hostApi.llm.models({}).then(function (response) {
            if (disposed || !response || !response.result || !response.result.ok) return;
            var groups = (response.result.value && response.result.value.groups) || [];
            var opts = [];
            groups.forEach(function (group) {
              (group.models || []).forEach(function (model) {
                opts.push({
                  provider: group.id,
                  model: model.id,
                  name: model.name || model.id,
                  groupName: group.name || group.id,
                });
              });
            });
            if (!disposed) setModelOptions(opts);
          }).catch(function () { /* 模型目录不可用 */ });
        }

        // 最近使用的模型（settings.yaml 的 agent-default-model）。
        if (connectApi && connectApi.getRecentModel) {
          connectApi.getRecentModel('qqbot').then(function (recent) {
            if (!disposed) setRecentModel(recent);
          }).catch(function () { /* 忽略 */ });
        }
        var off = connectApi.onOutput(function (payload) {
          if (!payload) return;
          var channelId = payload.channelId || "system";
          if (payload.type === "output") appendLog(channelId, payload.text || "");
          else if (payload.type === "log") appendLog(channelId, "[info] " + (payload.message || ""));
          else if (payload.type === "progress") appendLog(channelId, "[进度] " + (payload.stage || "") + (typeof payload.percent === "number" && payload.percent >= 0 ? " " + payload.percent + "%" : ""));
          else if (payload.type === "status") {
            setChannels(function (prev) {
              return prev.map(function (channel) {
                if (channel.id !== channelId) return channel;
                return { ...channel, running: Boolean(payload.running) };
              });
            });
            if (payload.running) appendLog(channelId, "[状态] 进程已启动" + (payload.pid ? "（PID " + payload.pid + "）" : ""));
            else appendLog(channelId, "[状态] 进程已停止" + (payload.code !== undefined && payload.code !== null ? "（退出码 " + payload.code + "）" : ""));
          } else if (payload.type === "bot-info") {
            setChannels(function (prev) {
              return prev.map(function (channel) {
                if (channel.id !== channelId) return channel;
                return { ...channel, botInfo: { appId: payload.appId || null, botId: payload.botId || null, botName: payload.botName || null } };
              });
            });
            appendLog(channelId, "[机器人信息] " + (payload.botName || "未知昵称") + "（ID: " + (payload.botId || "未知") + "，AppID: " + (payload.appId || "未知") + "）");
          } else if (payload.type === "health") {
            setChannels(function (prev) {
              return prev.map(function (channel) {
                if (channel.id !== channelId) return channel;
                return { ...channel, health: payload.health || null };
              });
            });
          } else if (payload.type === "account-info") {
            setChannels(function (prev) {
              return prev.map(function (channel) {
                if (channel.id !== channelId) return channel;
                return { ...channel, accountInfo: payload.accounts || [] };
              });
            });
          } else if (payload.type === "done") {
            appendLog(channelId, "[完成]");
          }
        });
        return function () {
          disposed = true;
          if (off) off();
        };
      }, []);

      var run = function (channel, method, label) {
        if (!connectApi) return Promise.resolve();
        setBusyFor(channel.id, true);
        appendLog(channel.id, "===== " + label + " =====");
        return connectApi[method](channel.id).then(function (result) {
          if (result && result.length !== undefined) setChannels(result);
          appendLog(channel.id, "===== " + label + " 完成 =====");
        }).catch(function (error) {
          appendLog(channel.id, "[错误] " + (error && error.message ? error.message : error));
        }).finally(function () {
          setBusyFor(channel.id, false);
        });
      };

      var refreshUpdates = function () {
        if (!connectApi) return;
        connectApi.checkUpdates().then(function (list) {
          setUpdates(list || []);
        }).catch(function () { /* 更新检查失败不打扰 */ });
      };

      var checkUpdatesFor = function (channel) {
        if (!connectApi) return;
        setLogId(channel.id);
        appendLog(channel.id, "===== 检查更新 =====");
        connectApi.checkUpdates().then(function (list) {
          setUpdates(list || []);
          var info = (list || []).find(function (item) { return item.id === channel.id; });
          if (info && info.hasUpdate) appendLog(channel.id, "发现新版本 v" + info.latestVersion + "（当前 v" + info.installedVersion + "）");
          else if (info) appendLog(channel.id, "已是最新版本（v" + info.latestVersion + "）");
          else appendLog(channel.id, "未获取到更新信息");
        }).catch(function (error) {
          appendLog(channel.id, "[错误] 检查更新失败：" + (error && error.message ? error.message : error));
        });
      };

      var startBind = function (channel) {
        if (channel.kind === "cli") {
          run(channel, "start", "启动守护");
          return;
        }
        // 清掉上次运行日志，确保二维码/状态来自本次运行。
        setLogMap(function (prev) {
          var copy = {};
          for (var key in prev) copy[key] = prev[key];
          copy[channel.id] = [];
          return copy;
        });
        setBindId(channel.id);
        run(channel, "start", "启动并扫码绑定");
      };

      var stopBind = function (channel) {
        run(channel, "stop", "停止");
      };

      var openAccounts = function (channel) {
        if (!connectApi || !connectApi.getAccounts) return;
        connectApi.getAccounts(channel.id).then(function (accounts) {
          setAccountChannel({ channel: channel, accounts: accounts || [] });
        }).catch(function (error) {
          appendLog(channel.id, "[错误] 获取账号失败：" + (error && error.message ? error.message : error));
        });
      };

      var channelCards = (channels || []).map(function (channel) {
        var running = Boolean(channel.running);
        var installed = Boolean(channel.bundleInstalled);
        var isBusy = Boolean(busy[channel.id]);
        var isCli = channel.kind === "cli";
        var logs = logMap[channel.id] || [];
        var bindState = deriveChannelState(channel, logs);
        var logoText = (channel.name || channel.id || "?").slice(0, 2).toUpperCase();

        return create("div", { className: "dsh-connect-card", key: channel.id },
          create("div", { className: "dsh-connect-card-top" },
            create("div", { className: "dsh-connect-logo" }, logoText),
            create("div", null,
              create("p", { className: "dsh-connect-name" }, channel.name)),
            create("div", { className: "dsh-connect-status" },
              create(primitives.StateDot, {
                state: running ? "ongoing" : (installed ? "done" : "warning"),
                size: 10,
              }),
              running ? "运行中" : (installed ? ("已安装" + (channel.version ? " v" + channel.version : "")) : "未安装"))),
          create("p", { className: "dsh-connect-desc" }, channel.description || ""),
          channel.botInfo && (channel.botInfo.botId || channel.botInfo.botName)
            ? create("p", { className: "dsh-connect-botinfo" },
                "已连接机器人：" + (channel.botInfo.botName || "未知昵称")
                + (channel.botInfo.botId ? "（ID: " + channel.botInfo.botId + "）" : "")
                + (channel.botInfo.appId ? "　AppID: " + channel.botInfo.appId : ""))
            : null,
          isCli && channel.health && channel.health.gateway
            ? create("p", { className: "dsh-connect-botinfo" },
                "网关：" + (channel.health.gateway.healthy ? "HEALTHY" : (channel.health.gateway.reachable ? "DEGRADED" : "UNREACHABLE"))
                + "（端口 " + (channel.health.gateway.port || "?") + "）"
                + (Array.isArray(channel.health.channels) && channel.health.channels.length > 0
                  ? "　渠道：" + channel.health.channels.map(function (item) { return (item.name || "?") + (item.ok ? "✓" : "✗"); }).join(", ")
                  : ""))
            : null,
          Array.isArray(channel.accountInfo) && channel.accountInfo.length > 0
            ? create("p", { className: "dsh-connect-botinfo" },
                "已绑定账号：" + channel.accountInfo
                  .filter(function (item) { return item.accounts && item.accounts.length > 0; })
                  .map(function (item) { return item.channel + "(" + item.accounts.join(", ") + ")"; })
                  .join("、"))
            : null,
          isCli ? null : create(ModelEditor, {
            channel: channel,
            desktop: desktop,
            connectApi: connectApi,
            appendLog: appendLog,
            onSaved: setChannels,
            modelOptions: modelOptions,
            recentModel: recentModel,
          }),
          create("div", { className: "dsh-connect-actions" },
            installed
              ? create(primitives.Button, {
                  variant: "primary",
                  size: "sm",
                  icon: create(primitives.IconPlayOutline16),
                  disabled: isBusy || running,
                  onClick: function () { startBind(channel); },
                }, running ? "运行中" : (isCli ? "启动守护" : "启动并扫码绑定"))
              : create(primitives.Button, {
                  variant: "primary",
                  size: "sm",
                  icon: create(primitives.IconPlusOutline16),
                  disabled: isBusy,
                  onClick: function () { run(channel, "install", "安装"); },
                }, isCli ? "安装到自管目录" : "安装到 dsh profile"),
            installed
              ? create(primitives.Button, {
                  variant: "outline",
                  size: "sm",
                  disabled: isBusy || !running,
                  onClick: function () { stopBind(channel); },
                }, "停止")
              : null,
            installed
              ? create(primitives.Button, {
                  variant: "outline",
                  size: "sm",
                  disabled: isBusy,
                  onClick: function () { openAccounts(channel); },
                }, "账号")
              : null,
            installed
              ? create(primitives.Button, {
                  variant: "outline",
                  size: "sm",
                  disabled: isBusy,
                  onClick: function () { run(channel, "switchAccount", "切换账号"); },
                }, "切换账号")
              : null,
            installed
              ? create(primitives.Button, {
                  variant: "outline",
                  size: "sm",
                  disabled: isBusy,
                  onClick: function () { run(channel, "uninstall", "卸载"); },
                }, "卸载")
              : null,
            create(primitives.Button, {
              variant: "ghost",
              size: "sm",
              icon: create(primitives.IconLinkOutline14),
              disabled: isBusy,
              onClick: function () { setLogId(channel.id); },
            }, "日志"),
            (function () {
              var info = (updates || []).find(function (item) { return item.id === channel.id; });
              if (info && info.hasUpdate) {
                return create(primitives.Button, {
                  variant: "primary",
                  size: "sm",
                  disabled: isBusy,
                  onClick: function () {
                    setLogId(channel.id);
                    run(channel, "update", "更新到 v" + info.latestVersion).finally(refreshUpdates);
                  },
                }, "更新到 v" + info.latestVersion);
              }
              return null;
            })(),
            create(primitives.Button, {
              variant: "ghost",
              size: "sm",
              disabled: isBusy,
              onClick: function () { checkUpdatesFor(channel); },
            }, "检查更新"),
            create("span", { className: "dsh-connect-spacer" }),
            channel.docs
              ? create(primitives.Button, {
                  variant: "ghost",
                  size: "sm",
                  icon: create(primitives.IconGlobeOutline14),
                  onClick: function () {
                    if (desktop && desktop.openExternal) desktop.openExternal(channel.docs);
                  },
                }, "文档")
              : null));
      });

      var bindChannel = (channels || []).find(function (channel) { return channel.id === bindId; }) || null;
      var logChannel = (channels || []).find(function (channel) { return channel.id === logId; }) || null;
      var bindLogs = bindChannel ? (logMap[bindChannel.id] || []) : [];
      var bindState = bindChannel ? deriveChannelState(bindChannel, bindLogs) : { state: "idle", text: "" };
      var qrBlock = bindChannel ? extractQrBlock(bindLogs) : "";

      return create("div", { className: "dsh-connect" },
        create("div", { className: "dsh-connect-header" },
          create("h3", { className: "dsh-connect-title" }, "互联"),
          create("p", { className: "dsh-connect-subtitle" }, "把聊天渠道接入 dsh。启动渠道后，首次绑定会弹出二维码，扫码完成后即可通过该渠道与 dsh 对话。")),
        connectApi ? null : create("p", { className: "dsh-connect-subtitle" }, "当前不是桌面端环境，渠道管理仅可通过命令行动作。"),
        create("div", { className: "dsh-connect-list" }, channelCards),

        create(primitives.Modal, {
          open: Boolean(logChannel),
          onClose: function () { setLogId(null); },
          title: (logChannel ? logChannel.name : "") + " · 运行日志",
          description: "实时输出，包含渠道进程的二维码与运行信息。",
          footer: create(primitives.Button, {
            variant: "outline",
            size: "sm",
            onClick: function () { setLogId(null); },
          }, "关闭"),
        }, create("pre", { className: "dsh-connect-log" }, ((logChannel ? logMap[logChannel.id] : []) || []).join("\n") + "\n")),

        create(primitives.Modal, {
          open: Boolean(accountChannel),
          onClose: function () { setAccountChannel(null); },
          title: (accountChannel && accountChannel.channel ? accountChannel.channel.name : "") + " · 已绑定账号",
          description: "查看、删除或切换该渠道下已绑定的账号。",
          footer: create(primitives.Button, {
            variant: "outline",
            size: "sm",
            onClick: function () { setAccountChannel(null); },
          }, "关闭"),
        }, create("div", null,
          accountChannel && accountChannel.accounts && accountChannel.accounts.length > 0
            ? accountChannel.accounts.map(function (account) {
                return create("div", { key: account.id, style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--dsw-alias-border)" } },
                  create("span", { style: { flex: 1, fontSize: 13, color: "var(--dsw-alias-label-primary)" } },
                    (account.name || "账号") + (account.detail ? "　" + account.detail : "")),
                  create(primitives.Button, {
                    variant: "outline",
                    size: "sm",
                    onClick: function () {
                      setAccountChannel(null);
                      run(accountChannel.channel, "switchAccount", "切换账号");
                    },
                  }, "切换"),
                  create(primitives.Button, {
                    variant: "outline",
                    size: "sm",
                    onClick: function () {
                      if (!connectApi || !connectApi.removeAccount) return;
                      connectApi.removeAccount(accountChannel.channel.id).then(function (list) {
                        if (list && list.length !== undefined) setChannels(list);
                        appendLog(accountChannel.channel.id, "[账号] 已删除");
                        setAccountChannel(null);
                      }).catch(function (error) {
                        appendLog(accountChannel.channel.id, "[错误] 删除账号失败：" + (error && error.message ? error.message : error));
                      });
                    },
                  }, "删除"));
              })
            : create("p", { style: { fontSize: 13, color: "var(--dsw-alias-label-secondary)" } }, "暂未检测到已绑定账号。请先启动并扫码绑定。"))),

        create(primitives.Modal, {
          open: Boolean(bindChannel),
          onClose: function () { setBindId(null); },
          title: (bindChannel ? bindChannel.name : "") + " · 扫码绑定",
          description: bindChannel && bindChannel.id === "wxclaw"
            ? "请使用微信扫描下方二维码，绑定成功后即可在微信里与 dsh 对话。"
            : "请使用手机 QQ 扫描下方二维码，绑定成功后进程会持续在线。",
          footer: create("div", { style: { display: "flex", gap: 8 } },
            bindChannel && bindChannel.running
              ? create(primitives.Button, {
                  variant: "outline",
                  size: "sm",
                  onClick: function () { stopBind(bindChannel); },
                }, "停止")
              : null,
            create(primitives.Button, {
              variant: "ghost",
              size: "sm",
              onClick: function () { setBindId(null); },
            }, "关闭")),
        },
          create("div", null,
            qrBlock
              ? create("pre", { className: "dsh-connect-qr" }, qrBlock)
              : create("div", { className: "dsh-connect-qr-empty" },
                  create(primitives.StateDot, { state: "ongoing", size: 12 }),
                  "正在等待二维码…")),
            create("div", { className: "dsh-connect-status-row" },
              create(primitives.StateDot, { state: bindState.state, size: 10 }),
              bindState.text)));
    }

    function MarketSection() {
      var create = react.createElement;
      var useState = react.useState;
      var useEffect = react.useEffect;

      var pluginsState = useState([]);
      var plugins = pluginsState[0];
      var setPlugins = pluginsState[1];
      var installedState = useState([]);
      var installed = installedState[0];
      var setInstalled = installedState[1];
      var searchState = useState("");
      var search = searchState[0];
      var setSearch = searchState[1];
      var onlyInstalledState = useState(false);
      var onlyInstalled = onlyInstalledState[0];
      var setOnlyInstalled = onlyInstalledState[1];
      var categoryState = useState("");
      var category = categoryState[0];
      var setCategory = categoryState[1];
      var loadingState = useState(false);
      var loading = loadingState[0];
      var setLoading = loadingState[1];
      var logState = useState([]);
      var logLines = logState[0];
      var setLogLines = logState[1];
      var logOpenState = useState(false);
      var logOpen = logOpenState[0];
      var setLogOpen = logOpenState[1];

      var marketApi = (typeof window !== "undefined" && window.desktopAPI && window.desktopAPI.market) ? window.desktopAPI.market : null;

      var appendLog = function (text) {
        setLogLines(function (prev) { return prev.concat([text]).slice(-80); });
      };

      var refresh = function () {
        if (!marketApi) return;
        setLoading(true);
        marketApi.installed().then(function (list) {
          setInstalled(list || []);
        }).catch(function () {});
        marketApi.list().then(function (list) {
          setPlugins(list || []);
        }).catch(function (error) {
          appendLog("[错误] " + (error && error.message ? error.message : error));
        }).finally(function () {
          setLoading(false);
        });
      };

      useEffect(function () {
        refresh();
        if (marketApi && marketApi.onOutput) {
          var off = marketApi.onOutput(function (payload) {
            if (!payload || payload.channelId !== "market") return;
            if (payload.type === "log") appendLog(payload.message || "");
            else if (payload.type === "output") appendLog(payload.text || "");
          });
          return function () { if (off) off(); };
        }
        return undefined;
      }, []);

      var installedNames = {};
      (installed || []).forEach(function (item) { installedNames[item.name] = true; });

      var allCategories = [];
      var seenCategories = {};
      (plugins || []).forEach(function (plugin) {
        (plugin.categories || []).forEach(function (cat) {
          if (!seenCategories[cat]) {
            seenCategories[cat] = true;
            allCategories.push(cat);
          }
        });
      });

      var filtered = (plugins || []).filter(function (plugin) {
        if (onlyInstalled) {
          var installedMatch = Boolean(installedNames[plugin.name] || installedNames[plugin.repo] || installedNames["@" + plugin.owner + "/" + plugin.repo]);
          if (!installedMatch) return false;
        } else if (category && (plugin.categories || []).indexOf(category) < 0) {
          return false;
        }
        if (!search.trim()) return true;
        var q = search.trim().toLowerCase();
        return (plugin.name || "").toLowerCase().indexOf(q) >= 0
          || (plugin.description || "").toLowerCase().indexOf(q) >= 0
          || (plugin.owner || "").toLowerCase().indexOf(q) >= 0
          || (plugin.repo || "").toLowerCase().indexOf(q) >= 0;
      }).slice(0, 200);

      return create("div", { className: "dsh-market" },
        create("div", { className: "dsh-market-bar" },
          create("input", {
            placeholder: "搜索插件名称 / 作者 / 介绍…",
            value: search,
            onChange: function (event) { setSearch(event.target.value); },
          }),
          create(primitives.Button, {
            variant: onlyInstalled ? "primary" : "outline",
            size: "sm",
            onClick: function () { setOnlyInstalled(!onlyInstalled); },
          }, "已安装"),
          create(primitives.Button, {
            variant: "outline",
            size: "sm",
            disabled: loading,
            onClick: refresh,
          }, loading ? "加载中…" : "刷新")),
        create("div", { className: "dsh-market-bar" },
          create("span", {
            className: "dsh-market-tag",
            style: { cursor: "pointer", opacity: category ? 0.65 : 1 },
            onClick: function () { setCategory(""); },
          }, "全部"),
          allCategories.map(function (cat) {
            var active = category === cat;
            return create("span", {
              key: cat,
              className: "dsh-market-tag",
              style: {
                cursor: "pointer",
                borderColor: active ? "var(--dsw-alias-accent,#4d6bfe)" : undefined,
                color: active ? "var(--dsw-alias-accent,#4d6bfe)" : undefined,
              },
              onClick: function () { setCategory(active ? "" : cat); },
            }, cat);
          })),
        create("div", { className: "dsh-market-grid" },
          filtered.map(function (plugin) {
            var isInstalled = Boolean(
              installedNames[plugin.name]
              || installedNames[plugin.repo]
              || installedNames["@" + plugin.owner + "/" + plugin.repo]
              || installedNames[plugin.repoPath]
            );
            return create("div", { className: "dsh-market-card", key: plugin.href },
              create("p", { className: "dsh-market-name" }, plugin.name),
              create("p", { className: "dsh-market-owner" }, plugin.owner + "/" + plugin.repo),
              create("p", { className: "dsh-market-desc" }, plugin.description || ""),
              create("div", { className: "dsh-market-meta" },
                plugin.stars ? create("span", { className: "dsh-market-tag" }, "★ " + plugin.stars) : null,
                (plugin.categories || []).map(function (cat) {
                  return create("span", { className: "dsh-market-tag", key: cat }, cat);
                })),
              create("div", { className: "dsh-market-actions" },
                create(primitives.Button, {
                  variant: "ghost",
                  size: "sm",
                  icon: create(primitives.IconGlobeOutline14),
                  onClick: function () {
                    if (window.desktopAPI && window.desktopAPI.openExternal) {
                      window.desktopAPI.openExternal("https://github.com/" + plugin.repoPath);
                    }
                  },
                }, "GitHub"),
                isInstalled
                  ? create(primitives.Button, {
                      variant: "outline",
                      size: "sm",
                      onClick: function () {
                        if (!marketApi) return;
                        setLogOpen(true);
                        appendLog("===== 卸载 " + plugin.name + " =====");
                        var spec = installed.find(function (item) {
                          return item.name === plugin.name
                            || item.name === plugin.repo
                            || item.name === "@" + plugin.owner + "/" + plugin.repo;
                        });
                        marketApi.uninstall(spec ? spec.name : plugin.repo).then(function (list) {
                          setInstalled(list || []);
                          appendLog("已卸载 " + plugin.name + "，正在重启 dsh web 使变更生效…");
                        }).catch(function (error) {
                          appendLog("[错误] " + (error && error.message ? error.message : error));
                        });
                      },
                    }, "卸载")
                  : create(primitives.Button, {
                      variant: "primary",
                      size: "sm",
                      onClick: function () {
                        if (!marketApi) return;
                        setLogOpen(true);
                        appendLog("===== 安装 " + plugin.name + " =====");
                        appendLog("读取详情页并执行 dsh plugin add …");
                        marketApi.install(plugin.repoPath).then(function (list) {
                          setInstalled(list || []);
                          appendLog("安装完成 " + plugin.name + "，正在重启 dsh web 使插件生效…");
                        }).catch(function (error) {
                          appendLog("[错误] " + (error && error.message ? error.message : error));
                        });
                      },
                    }, "安装")));
          })),
        filtered.length === 0
          ? create("p", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: 13 } }, loading ? "正在从 dshplugin.store 加载插件列表…" : "没有匹配的插件")
          : null,
        create(primitives.Modal, {
          open: logOpen,
          onClose: function () { setLogOpen(false); },
          title: "插件市场 · 操作日志",
          description: "安装/卸载过程日志。安装完成后会自动重启 dsh web 使插件生效。",
          footer: create(primitives.Button, {
            variant: "outline",
            size: "sm",
            onClick: function () { setLogOpen(false); },
          }, "关闭"),
        }, create("pre", { className: "dsh-connect-log" }, (logLines.join("\n") || "暂无日志") + "\n")));
    }

    function PluginInstallTab() {
      var create = react.createElement;
      var useState = react.useState;
      var useEffect = react.useEffect;

      var itemsState = useState([]);
      var items = itemsState[0];
      var setItems = itemsState[1];
      var linkState = useState("");
      var link = linkState[0];
      var setLink = linkState[1];
      var infoState = useState(null);
      var info = infoState[0];
      var setInfo = infoState[1];
      var logOpenState = useState(false);
      var logOpen = logOpenState[0];
      var setLogOpen = logOpenState[1];
      var logState = useState([]);
      var logLines = logState[0];
      var setLogLines = logState[1];

      var api = (typeof window !== "undefined" && window.desktopAPI && window.desktopAPI.pluginInstall) ? window.desktopAPI.pluginInstall : null;

      var appendLog = function (text) {
        setLogLines(function (prev) { return prev.concat([text]).slice(-120); });
      };

      var refresh = function () {
        if (!api) return;
        api.list().then(function (list) { setItems(list || []); }).catch(function (error) {
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      useEffect(function () {
        refresh();
        if (api && api.onOutput) {
          var off = api.onOutput(function (payload) {
            if (!payload || payload.channelId !== "plugin-install") return;
            if (payload.type === "log") appendLog(payload.message || "");
            else if (payload.type === "output") appendLog(payload.text || "");
          });
          return function () { if (off) off(); };
        }
        return undefined;
      }, []);

      var inspect = function () {
        if (!api || !link.trim()) return;
        setLogOpen(true);
        appendLog("===== 查看插件链接 =====");
        appendLog(link.trim());
        api.inspect(link.trim()).then(function (data) {
          setInfo(data);
          appendLog("已获取插件信息：" + (data.name || ""));
        }).catch(function (error) {
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      var install = function () {
        if (!api || !link.trim()) return;
        setLogOpen(true);
        appendLog("===== 下载安装插件 =====");
        appendLog(link.trim());
        api.install(link.trim()).then(function (list) {
          setItems(list || []);
          appendLog("安装完成，正在重启 dsh web 使插件生效…");
        }).catch(function (error) {
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      var importLocal = function () {
        if (!api) return;
        setLogOpen(true);
        appendLog("===== 本地导入插件 =====");
        api.importLocal().then(function (list) {
          setItems(list || []);
          appendLog("本地插件安装完成，正在重启 dsh web 使插件生效…");
        }).catch(function (error) {
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      var remove = function (item) {
        if (!api) return;
        setLogOpen(true);
        appendLog("===== 删除插件 " + item.name + " =====");
        api.remove(item.name).then(function (list) {
          setItems(list || []);
          appendLog("已删除 " + item.name + "，正在重启 dsh web…");
        }).catch(function (error) {
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      return create("div", { className: "dsh-install" },
        create("div", { className: "dsh-install-card" },
          create("h3", null, "本地导入"),
          create("p", null, "选择一个 dsh 插件文件夹（或 package.json），自动安装到当前 dsh 的 web profile。"),
          create("div", { className: "dsh-install-row" },
            create(primitives.Button, {
              variant: "primary",
              size: "sm",
              icon: create(primitives.IconFolderOpenOutline16),
              onClick: importLocal,
            }, "选择插件文件夹"))),
        create("div", { className: "dsh-install-card" },
          create("h3", null, "从链接安装"),
          create("p", null, "输入插件链接（一般为 GitHub 仓库地址），先点击查看获取插件信息，再下载安装。"),
          create("div", { className: "dsh-install-row" },
            create("input", {
              placeholder: "https://github.com/owner/repo",
              value: link,
              onChange: function (event) { setLink(event.target.value); },
            }),
            create(primitives.Button, {
              variant: "outline",
              size: "sm",
              disabled: !link.trim(),
              onClick: inspect,
            }, "查看"),
            create(primitives.Button, {
              variant: "primary",
              size: "sm",
              disabled: !link.trim(),
              onClick: install,
            }, "下载安装"))),
        create("div", { className: "dsh-install-card" },
          create("h3", null, "本界面安装的插件"),
          create("p", null, "以下是通过本界面安装的插件，可查看信息或删除。"),
          items.length === 0
            ? create("p", null, "暂无通过本界面安装的插件。")
            : items.map(function (item) {
                return create("div", { className: "dsh-install-item", key: item.name },
                  create("div", { className: "info" },
                    create("div", { className: "name" }, item.name),
                    create("div", { className: "meta" }, (item.source || "") + " · " + (item.path || "") + " · " + (item.installedAt || ""))),
                  create(primitives.Button, {
                    variant: "ghost",
                    size: "sm",
                    onClick: function () {
                      setInfo({ name: item.name, version: "", description: "来源：" + (item.path || item.source || ""), source: item.path || item.source || "", spec: item.spec || item.name });
                      setLogOpen(true);
                    },
                  }, "查看信息"),
                  create(primitives.Button, {
                    variant: "outline",
                    size: "sm",
                    onClick: function () { remove(item); },
                  }, "删除"));
              })),
        create(primitives.Modal, {
          open: Boolean(info),
          onClose: function () { setInfo(null); },
          title: "插件信息",
          description: info ? (info.owner ? info.owner + "/" + info.repo : "") : "",
          footer: create("div", { style: { display: "flex", gap: 8 } },
            info && info.source && /^https?:/i.test(info.source)
              ? create(primitives.Button, {
                  variant: "outline",
                  size: "sm",
                  onClick: function () {
                    if (window.desktopAPI && window.desktopAPI.openExternal) window.desktopAPI.openExternal(info.source);
                  },
                }, "打开源码")
              : null,
            create(primitives.Button, {
              variant: "ghost",
              size: "sm",
              onClick: function () { setInfo(null); },
            }, "关闭")),
        }, create("div", null,
          create("p", { style: { margin: "0 0 8px", fontSize: 14, color: "var(--dsw-alias-label-primary)" } }, info ? info.name : ""),
          create("p", { style: { margin: 0, fontSize: 13, color: "var(--dsw-alias-label-secondary)", lineHeight: 1.6 } }, info ? (info.version ? "版本：" + info.version + "\n" : "") + (info.description || "") : ""))),
        create(primitives.Modal, {
          open: logOpen,
          onClose: function () { setLogOpen(false); },
          title: "插件安装 · 操作日志",
          description: "本地导入 / 链接安装 / 删除 的实时日志。",
          footer: create(primitives.Button, {
            variant: "outline",
            size: "sm",
            onClick: function () { setLogOpen(false); },
          }, "关闭"),
        }, create("pre", { className: "dsh-connect-log" }, (logLines.join("\n") || "暂无日志") + "\n")));
    }

    function SkillSection() {
      var create = react.createElement;
      var useState = react.useState;
      var useEffect = react.useEffect;

      var tabState = useState("installed");
      var tab = tabState[0];
      var setTab = tabState[1];
      var itemsState = useState([]);
      var items = itemsState[0];
      var setItems = itemsState[1];
      var linkState = useState("");
      var link = linkState[0];
      var setLink = linkState[1];
      var infoState = useState(null);
      var info = infoState[0];
      var setInfo = infoState[1];
      var logOpenState = useState(false);
      var logOpen = logOpenState[0];
      var setLogOpen = logOpenState[1];
      var logState = useState([]);
      var logLines = logState[0];
      var setLogLines = logState[1];
      var loadingState = useState(false);
      var loading = loadingState[0];
      var setLoading = loadingState[1];
      var marketSourceState = useState("");
      var marketSource = marketSourceState[0];
      var setMarketSource = marketSourceState[1];
      var marketSkillsState = useState([]);
      var marketSkills = marketSkillsState[0];
      var setMarketSkills = marketSkillsState[1];
      var marketLoadingState = useState(false);
      var marketLoading = marketLoadingState[0];
      var setMarketLoading = marketLoadingState[1];

      var api = (typeof window !== "undefined" && window.desktopAPI && window.desktopAPI.skills) ? window.desktopAPI.skills : null;

      var appendLog = function (text) {
        setLogLines(function (prev) { return prev.concat([text]).slice(-120); });
      };

      var refresh = function () {
        if (!api) return;
        setLoading(true);
        api.list().then(function (list) {
          setItems(list || []);
        }).catch(function (error) {
          appendLog("[错误] " + (error && error.message ? error.message : error));
        }).finally(function () {
          setLoading(false);
        });
      };

      useEffect(function () {
        refresh();
        if (api && api.getMarketSource) {
          api.getMarketSource().then(function (source) {
            setMarketSource(source || "");
            loadMarket(source || "");
          }).catch(function () { /* 忽略 */ });
        }
        if (api && api.onOutput) {
          var off = api.onOutput(function (payload) {
            if (!payload || payload.channelId !== "skills") return;
            if (payload.type === "log") appendLog(payload.message || "");
            else if (payload.type === "output") appendLog(payload.text || "");
            else if (payload.type === "progress") appendLog("[进度] " + (payload.stage || "") + (typeof payload.percent === "number" && payload.percent >= 0 ? " " + payload.percent + "%" : ""));
          });
          return function () { if (off) off(); };
        }
        return undefined;
      }, []);

      var importLocal = function () {
        if (!api) return;
        setLogOpen(true);
        appendLog("===== 本地导入 skill =====");
        api.importLocal().then(function (list) {
          setItems(list || []);
          appendLog("本地 skill 导入完成。");
        }).catch(function (error) {
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      var inspect = function () {
        if (!api || !link.trim()) return;
        setLogOpen(true);
        appendLog("===== 查看 skill 链接 =====");
        api.inspect(link.trim()).then(function (data) {
          setInfo(data);
          appendLog("已获取 skill 信息：" + (data.name || ""));
        }).catch(function (error) {
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      var install = function () {
        if (!api || !link.trim()) return;
        setLogOpen(true);
        appendLog("===== 下载安装 skill =====");
        api.install(link.trim()).then(function (list) {
          setItems(list || []);
          appendLog("skill 安装完成。");
        }).catch(function (error) {
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      var remove = function (item) {
        if (!api || !item.removable) return;
        setLogOpen(true);
        appendLog("===== 删除 skill " + item.name + " =====");
        api.remove(item.name).then(function (list) {
          setItems(list || []);
          appendLog("已删除 " + item.name);
        }).catch(function (error) {
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      var loadMarket = function (source) {
        if (!api) return;
        var target = source || marketSource;
        if (!target.trim()) return;
        setMarketLoading(true);
        appendLog("===== 加载技能市场 =====");
        appendLog(target.trim());
        api.marketList(target.trim()).then(function (list) {
          setMarketSkills(list || []);
          appendLog("获取到 " + (list || []).length + " 个技能。");
        }).catch(function (error) {
          setLogOpen(true);
          appendLog("[错误] " + (error && error.message ? error.message : error));
        }).finally(function () {
          setMarketLoading(false);
        });
      };

      var saveMarketSource = function () {
        if (!api || !marketSource.trim()) return;
        setLogOpen(true);
        appendLog("===== 保存市场源 =====");
        api.setMarketSource(marketSource.trim()).then(function () {
          appendLog("市场源已保存：" + marketSource.trim());
          loadMarket(marketSource.trim());
        }).catch(function (error) {
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      var viewMarket = function (item) {
        if (!api) return;
        setLogOpen(true);
        appendLog("===== 查看市场 skill " + item.name + " =====");
        api.marketView(marketSource, item.name).then(function (data) {
          setInfo(data);
          appendLog("已获取详情。");
        }).catch(function (error) {
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      var installMarket = function (item) {
        if (!api) return;
        setLogOpen(true);
        appendLog("===== 下载市场 skill " + item.name + " =====");
        api.marketInstall(marketSource, item.name).then(function (list) {
          setItems(list || []);
          appendLog("市场 skill 已安装。");
        }).catch(function (error) {
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      return create("div", { className: "dsh-install" },
        create("div", { className: "dsh-skill-tabs" },
          create("button", {
            className: "dsh-skill-tab" + (tab === "installed" ? " active" : ""),
            onClick: function () { setTab("installed"); },
          }, "已安装"),
          create("button", {
            className: "dsh-skill-tab" + (tab === "install" ? " active" : ""),
            onClick: function () { setTab("install"); },
          }, "安装"),
          create("button", {
            className: "dsh-skill-tab" + (tab === "market" ? " active" : ""),
            onClick: function () { setTab("market"); },
          }, "技能市场")),
        tab === "installed"
          ? create("div", { className: "dsh-skill-grid" },
              items.length === 0
                ? create("p", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: 13 } }, loading ? "正在扫描 skill…" : "暂未发现 skill。可在「安装」标签页导入。")
                : items.map(function (item) {
                    return create("div", { className: "dsh-skill-card", key: item.name + item.source + item.path },
                      create("p", { className: "dsh-skill-name" }, item.name),
                      create("p", { className: "dsh-skill-desc" }, item.description || "（无描述）"),
                      create("p", { className: "dsh-skill-meta" }, "来源：" + item.source),
                      create("div", { className: "dsh-skill-actions" },
                        create(primitives.Button, {
                          variant: "ghost",
                          size: "sm",
                          onClick: function () {
                            setInfo({ name: item.name, description: item.description || "", source: item.path, owner: "", repo: "" });
                            setLogOpen(true);
                          },
                        }, "查看信息"),
                        item.removable
                          ? create(primitives.Button, {
                              variant: "outline",
                              size: "sm",
                              onClick: function () { remove(item); },
                            }, "删除")
                          : null));
                  }))
          : tab === "install"
            ? create("div", null,
                create("div", { className: "dsh-install-card" },
                  create("h3", null, "本地导入"),
                  create("p", null, "选择包含 SKILL.md 的文件夹，或单个 .md skill 文件，安装到 ~/.dsh/skills。"),
                  create("div", { className: "dsh-install-row" },
                    create(primitives.Button, {
                      variant: "primary",
                      size: "sm",
                      icon: create(primitives.IconFolderOpenOutline16),
                      onClick: importLocal,
                    }, "选择 skill"))),
                create("div", { className: "dsh-install-card" },
                  create("h3", null, "从链接安装"),
                  create("p", null, "输入 GitHub 仓库链接（仓库根目录包含 SKILL.md，或包含 skills/ 目录）。"),
                  create("div", { className: "dsh-install-row" },
                    create("input", {
                      placeholder: "https://github.com/owner/repo",
                      value: link,
                      onChange: function (event) { setLink(event.target.value); },
                    }),
                    create(primitives.Button, {
                      variant: "outline",
                      size: "sm",
                      disabled: !link.trim(),
                      onClick: inspect,
                    }, "查看"),
                    create(primitives.Button, {
                      variant: "primary",
                      size: "sm",
                      disabled: !link.trim(),
                      onClick: install,
                    }, "下载安装"))))
            : create("div", { className: "dsh-market" },
                create("div", { className: "dsh-market-bar" },
                  create("input", {
                    placeholder: "https://github.com/owner/repo/tree/main/skills",
                    value: marketSource,
                    onChange: function (event) { setMarketSource(event.target.value); },
                  }),
                  create(primitives.Button, {
                    variant: "primary",
                    size: "sm",
                    disabled: !marketSource.trim(),
                    onClick: saveMarketSource,
                  }, "保存并刷新"),
                  create(primitives.Button, {
                    variant: "outline",
                    size: "sm",
                    disabled: marketLoading,
                    onClick: function () { loadMarket(); },
                  }, marketLoading ? "加载中…" : "刷新")),
                marketSkills.length === 0
                  ? create("p", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: 13 } }, marketLoading ? "正在从市场源加载…" : "市场源暂无 skill，或加载失败。")
                  : create("div", { className: "dsh-skill-grid" },
                      marketSkills.map(function (item) {
                        return create("div", { className: "dsh-skill-card", key: item.name },
                          create("p", { className: "dsh-skill-name" }, item.name),
                          create("p", { className: "dsh-skill-desc" }, item.description || "（无描述）"),
                          item.whenToUse ? create("p", { className: "dsh-skill-meta" }, "适用场景：" + item.whenToUse) : null,
                          item.metadata ? create("p", { className: "dsh-skill-meta" }, "附加信息：" + item.metadata) : null,
                          create("div", { className: "dsh-skill-actions" },
                            create(primitives.Button, {
                              variant: "ghost",
                              size: "sm",
                              onClick: function () { viewMarket(item); },
                            }, "查看"),
                            create(primitives.Button, {
                              variant: "primary",
                              size: "sm",
                              onClick: function () { installMarket(item); },
                            }, "下载")));
                      }))),
        create(primitives.Modal, {
          open: Boolean(info),
          onClose: function () { setInfo(null); },
          title: "skill 信息",
          description: info ? (info.owner ? info.owner + "/" + info.repo : "") : "",
          footer: create("div", { style: { display: "flex", gap: 8 } },
            info && info.source && /^https?:/i.test(info.source)
              ? create(primitives.Button, {
                  variant: "outline",
                  size: "sm",
                  onClick: function () {
                    if (window.desktopAPI && window.desktopAPI.openExternal) window.desktopAPI.openExternal(info.source);
                  },
                }, "打开源码")
              : null,
            create(primitives.Button, {
              variant: "ghost",
              size: "sm",
              onClick: function () { setInfo(null); },
            }, "关闭")),
        }, create("div", null,
          create("p", { style: { margin: "0 0 8px", fontSize: 14, color: "var(--dsw-alias-label-primary)" } }, info ? info.name : ""),
          create("p", { style: { margin: 0, fontSize: 13, color: "var(--dsw-alias-label-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" } }, info ? info.description || "" : ""))),
        create(primitives.Modal, {
          open: logOpen,
          onClose: function () { setLogOpen(false); },
          title: "Skill · 操作日志",
          description: "本地导入 / 链接安装 / 删除 的实时日志。",
          footer: create(primitives.Button, {
            variant: "outline",
            size: "sm",
            onClick: function () { setLogOpen(false); },
          }, "关闭"),
        }, create("pre", { className: "dsh-connect-log" }, (logLines.join("\n") || "暂无日志") + "\n")));
    }

    function SchedulerSection() {
      var create = react.createElement;
      var useState = react.useState;
      var useEffect = react.useEffect;

      var tasksState = useState([]);
      var tasks = tasksState[0];
      var setTasks = tasksState[1];
      var runsState = useState([]);
      var runs = runsState[0];
      var setRuns = runsState[1];
      var formOpenState = useState(false);
      var formOpen = formOpenState[0];
      var setFormOpen = formOpenState[1];
      var editingState = useState(null);
      var editing = editingState[0];
      var setEditing = editingState[1];
      var runDetailState = useState(null);
      var runDetail = runDetailState[0];
      var setRunDetail = runDetailState[1];
      var logOpenState = useState(false);
      var logOpen = logOpenState[0];
      var setLogOpen = logOpenState[1];
      var logState = useState([]);
      var logLines = logState[0];
      var setLogLines = logState[1];

      var api = (typeof window !== "undefined" && window.desktopAPI && window.desktopAPI.scheduler) ? window.desktopAPI.scheduler : null;

      var appendLog = function (text) {
        setLogLines(function (prev) { return prev.concat([text]).slice(-120); });
      };

      var refreshTasks = function () {
        if (!api) return;
        api.list().then(function (list) { setTasks(list || []); }).catch(function (error) {
          setLogOpen(true);
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      var refreshRuns = function () {
        if (!api) return;
        api.runs().then(function (list) { setRuns(list || []); }).catch(function () {});
      };

      useEffect(function () {
        refreshTasks();
        refreshRuns();
        if (api && api.onOutput) {
          var off = api.onOutput(function (payload) {
            if (!payload || payload.channelId !== "scheduler") return;
            setLogOpen(true);
            if (payload.type === "log") appendLog(payload.message || "");
            else if (payload.type === "output") appendLog(payload.text || "");
            else if (payload.type === "progress") appendLog("[进度] " + (payload.stage || "") + (typeof payload.percent === "number" && payload.percent >= 0 ? " " + payload.percent + "%" : ""));
          });
          return function () { if (off) off(); };
        }
        return undefined;
      }, []);

      var scheduleSummary = function (task) {
        var s = task.schedule || {};
        if (s.type === "interval") return "每 " + (s.intervalMinutes || 60) + " 分钟";
        if (s.type === "daily") return "每天 " + (s.time || "08:00");
        if (s.type === "weekly") {
          var days = ["日", "一", "二", "三", "四", "五", "六"];
          return "每周" + (days[Number(s.day)] || "?") + " " + (s.time || "08:00");
        }
        if (s.type === "once") return "单次 " + (s.runAt ? new Date(s.runAt).toLocaleString() : "");
        return "未设置";
      };

      var openNew = function () {
        setEditing({
          name: "",
          enabled: true,
          schedule: { type: "interval", intervalMinutes: 60, time: "08:00", day: 1, runAt: "" },
          prompt: "",
          model: "",
          permissionMode: "workspace-write",
          skill: "",
          script: "",
        });
        setFormOpen(true);
      };

      var openEdit = function (task) {
        setEditing(JSON.parse(JSON.stringify(task)));
        setFormOpen(true);
      };

      var save = function () {
        if (!api || !editing) return;
        if (!editing.name.trim()) {
          setLogOpen(true);
          appendLog("[错误] 任务名称不能为空");
          return;
        }
        api.save(editing).then(function (list) {
          setTasks(list || []);
          setFormOpen(false);
          setEditing(null);
        }).catch(function (error) {
          setLogOpen(true);
          appendLog("[错误] 保存失败：" + (error && error.message ? error.message : error));
        });
      };

      var toggle = function (task) {
        if (!api) return;
        api.toggle(task.id, !task.enabled).then(function (list) { setTasks(list || []); }).catch(function (error) {
          setLogOpen(true);
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      var remove = function (task) {
        if (!api || !window.confirm) return;
        if (!window.confirm("确定删除定时任务「" + task.name + "」？")) return;
        api.delete(task.id).then(function (list) { setTasks(list || []); }).catch(function (error) {
          setLogOpen(true);
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      var runNow = function (task) {
        if (!api) return;
        setLogOpen(true);
        appendLog("===== 立即运行 " + task.name + " =====");
        api.runNow(task.id).then(function (result) {
          appendLog("任务已执行完成，状态见运行记录。");
          refreshTasks();
          refreshRuns();
        }).catch(function (error) {
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      var openRunDetail = function (run) {
        if (!api) return;
        api.runDetail(run.id).then(function (detail) {
          setRunDetail(detail || run);
        }).catch(function (error) {
          setLogOpen(true);
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      var deleteRun = function (run) {
        if (!api || !window.confirm) return;
        if (!window.confirm("确定删除这条运行记录？")) return;
        api.runDelete(run.id).then(function (list) {
          setRuns(list || []);
        }).catch(function (error) {
          setLogOpen(true);
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      var formSchedule = editing && editing.schedule ? editing.schedule : {};
      var setForm = function (patch) {
        setEditing(function (prev) { return prev ? { ...prev, ...patch } : prev; });
      };
      var setSchedule = function (patch) {
        setEditing(function (prev) {
          if (!prev) return prev;
          return { ...prev, schedule: { ...(prev.schedule || {}), ...patch } };
        });
      };

      var scheduleOptions = [
        { value: "interval", label: "间隔" },
        { value: "daily", label: "每天" },
        { value: "weekly", label: "每周" },
        { value: "once", label: "单次" },
      ];

      return create("div", { className: "dsh-install" },
        create("div", { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 12 } },
          create("h3", { style: { margin: 0, flex: 1, fontSize: 16, color: "var(--dsw-alias-label-primary)" } }, "定时任务"),
          create(primitives.Button, {
            variant: "primary",
            size: "sm",
            icon: create(primitives.IconPlusOutline16),
            onClick: openNew,
          }, "新建任务"),
          create(primitives.Button, {
            variant: "outline",
            size: "sm",
            onClick: function () { refreshTasks(); refreshRuns(); },
          }, "刷新")),
        tasks.length === 0
          ? create("p", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: 13 } }, "暂无定时任务，点击「新建任务」创建。")
          : create("div", { className: "dsh-skill-grid" },
              tasks.map(function (task) {
                return create("div", { className: "dsh-skill-card", key: task.id },
                  create("p", { className: "dsh-skill-name" }, task.name),
                  create("p", { className: "dsh-skill-meta" }, scheduleSummary(task) + (task.enabled ? " · 已启用" : " · 已禁用")),
                  task.nextRunAt ? create("p", { className: "dsh-skill-meta" }, "下次运行：" + new Date(task.nextRunAt).toLocaleString()) : create("p", { className: "dsh-skill-meta" }, "下次运行：未安排"),
                  create("div", { className: "dsh-skill-actions" },
                    create(primitives.Button, { variant: "outline", size: "sm", onClick: function () { toggle(task); } }, task.enabled ? "禁用" : "启用"),
                    create(primitives.Button, { variant: "primary", size: "sm", onClick: function () { runNow(task); } }, "立即运行"),
                    create(primitives.Button, { variant: "ghost", size: "sm", onClick: function () { openEdit(task); } }, "编辑"),
                    create(primitives.Button, { variant: "outline", size: "sm", onClick: function () { remove(task); } }, "删除")));
              })),
        create("div", { className: "dsh-install-card", style: { marginTop: 16 } },
          create("h3", null, "运行记录"),
          create("p", null, "最近 " + runs.length + " 次运行。"),
          runs.length === 0
            ? create("p", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: 13 } }, "暂无运行记录。")
            : create("div", null,
                runs.map(function (run) {
                  return create("div", { className: "dsh-install-item", key: run.id },
                    create("div", { className: "info" },
                      create("div", { className: "name" }, run.taskName + " · " + (run.status || "?")),
                      create("div", { className: "meta" }, new Date(run.startedAt).toLocaleString() + (run.finishedAt ? " → " + new Date(run.finishedAt).toLocaleTimeString() : "") + (run.exitCode !== null && run.exitCode !== undefined ? " · 退出码 " + run.exitCode : ""))),
                    create(primitives.Button, {
                      variant: "ghost",
                      size: "sm",
                      onClick: function () { openRunDetail(run); },
                    }, "查看日志"),
                    create(primitives.Button, {
                      variant: "outline",
                      size: "sm",
                      onClick: function () { deleteRun(run); },
                    }, "删除"));
                }))),
        create(primitives.Modal, {
          open: formOpen,
          onClose: function () { setFormOpen(false); setEditing(null); },
          title: editing && editing.id ? "编辑定时任务" : "新建定时任务",
          description: "配置执行频率、提示词、模型、权限、技能和前置脚本。",
          footer: create("div", { style: { display: "flex", gap: 8 } },
            create(primitives.Button, { variant: "outline", size: "sm", onClick: function () { setFormOpen(false); setEditing(null); } }, "取消"),
            create(primitives.Button, { variant: "primary", size: "sm", onClick: save }, "保存")),
        }, create("div", { style: { display: "flex", flexDirection: "column", gap: 10, maxHeight: "60vh", overflowY: "auto", paddingRight: 4 } },
          create("label", null, "任务名称"),
          create("input", {
            className: "dsh-market-bar input",
            style: { boxSizing: "border-box", width: "100%", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border)", color: "var(--dsw-alias-label-primary)", borderRadius: 10, padding: "10px 14px", fontSize: 14 },
            value: editing ? editing.name : "",
            onChange: function (event) { setForm({ name: event.target.value }); },
          }),
          create("label", null, "执行频率"),
          create("select", {
            value: formSchedule.type || "interval",
            onChange: function (event) { setSchedule({ type: event.target.value }); },
            style: { background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border)", color: "var(--dsw-alias-label-primary)", borderRadius: 10, padding: "10px 14px", fontSize: 14 },
          }, scheduleOptions.map(function (opt) {
            return create("option", { key: opt.value, value: opt.value }, opt.label);
          })),
          formSchedule.type === "interval"
            ? create("label", null,
                "间隔（分钟）",
                create("input", {
                  type: "number",
                  min: 1,
                  value: formSchedule.intervalMinutes || 60,
                  onChange: function (event) { setSchedule({ intervalMinutes: Number(event.target.value) || 60 }); },
                  style: { marginLeft: 8, width: 120, background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border)", color: "var(--dsw-alias-label-primary)", borderRadius: 10, padding: "6px 10px", fontSize: 13 },
                }))
            : null,
          formSchedule.type === "daily" || formSchedule.type === "weekly"
            ? create("label", null,
                "时间",
                create("input", {
                  type: "time",
                  value: formSchedule.time || "08:00",
                  onChange: function (event) { setSchedule({ time: event.target.value }); },
                  style: { marginLeft: 8, background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border)", color: "var(--dsw-alias-label-primary)", borderRadius: 10, padding: "6px 10px", fontSize: 13 },
                }))
            : null,
          formSchedule.type === "weekly"
            ? create("label", null,
                "星期",
                create("select", {
                  value: formSchedule.day !== undefined ? formSchedule.day : 1,
                  onChange: function (event) { setSchedule({ day: Number(event.target.value) }); },
                  style: { marginLeft: 8, background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border)", color: "var(--dsw-alias-label-primary)", borderRadius: 10, padding: "6px 10px", fontSize: 13 },
                }, ["日", "一", "二", "三", "四", "五", "六"].map(function (d, i) {
                  return create("option", { key: i, value: i }, "周" + d);
                })))
            : null,
          formSchedule.type === "once"
            ? create("label", null,
                "执行时间",
                create("input", {
                  type: "datetime-local",
                  value: formSchedule.runAt ? new Date(formSchedule.runAt).toISOString().slice(0, 16) : "",
                  onChange: function (event) { setSchedule({ runAt: new Date(event.target.value).toISOString() }); },
                  style: { marginLeft: 8, background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border)", color: "var(--dsw-alias-label-primary)", borderRadius: 10, padding: "6px 10px", fontSize: 13 },
                }))
            : null,
          create("label", null, "提示词"),
          create("textarea", {
            rows: 8,
            value: editing ? editing.prompt : "",
            onChange: function (event) { setForm({ prompt: event.target.value }); },
            style: { boxSizing: "border-box", width: "100%", minHeight: 180, resize: "vertical", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border)", color: "var(--dsw-alias-label-primary)", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontFamily: "inherit" },
          }),
          create("label", null, "模型（provider/model，可留空）"),
          create("input", {
            placeholder: "deepseek-official/deepseek-v4-flash",
            value: editing ? editing.model : "",
            onChange: function (event) { setForm({ model: event.target.value }); },
            style: { boxSizing: "border-box", width: "100%", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border)", color: "var(--dsw-alias-label-primary)", borderRadius: 10, padding: "10px 14px", fontSize: 14 },
          }),
          create("label", null, "权限模式"),
          create("select", {
            value: editing ? editing.permissionMode || "workspace-write" : "workspace-write",
            onChange: function (event) { setForm({ permissionMode: event.target.value }); },
            style: { background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border)", color: "var(--dsw-alias-label-primary)", borderRadius: 10, padding: "10px 14px", fontSize: 14 },
          }, ["workspace-write", "danger-full-access", "ask", "never"].map(function (mode) {
            return create("option", { key: mode, value: mode }, mode);
          })),
          create("label", null, "指定技能（可留空）"),
          create("input", {
            placeholder: "例如 report",
            value: editing ? editing.skill : "",
            onChange: function (event) { setForm({ skill: event.target.value }); },
            style: { boxSizing: "border-box", width: "100%", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border)", color: "var(--dsw-alias-label-primary)", borderRadius: 10, padding: "10px 14px", fontSize: 14 },
          }),
          create("label", null, "前置脚本（可留空）"),
          create("textarea", {
            rows: 4,
            placeholder: "例如：echo hello",
            value: editing ? editing.script : "",
            onChange: function (event) { setForm({ script: event.target.value }); },
            style: { boxSizing: "border-box", width: "100%", minHeight: 100, resize: "vertical", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border)", color: "var(--dsw-alias-label-primary)", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontFamily: "monospace" },
          }),
          create("label", null, "启用任务",
            create("input", {
              type: "checkbox",
              checked: editing ? Boolean(editing.enabled) : true,
              onChange: function (event) { setForm({ enabled: event.target.checked }); },
              style: { marginLeft: 8 },
            })))),
        create(primitives.Modal, {
          open: Boolean(runDetail),
          onClose: function () { setRunDetail(null); },
          title: runDetail ? "运行日志 · " + runDetail.taskName : "运行日志",
          description: runDetail ? new Date(runDetail.startedAt).toLocaleString() : "",
          footer: create(primitives.Button, { variant: "outline", size: "sm", onClick: function () { setRunDetail(null); } }, "关闭"),
        }, create("div", null,
          runDetail && runDetail.error ? create("p", { style: { color: "var(--dsw-alias-error,#f87171)", fontSize: 13 } }, "错误：" + runDetail.error) : null,
          create("pre", { className: "dsh-connect-log" },
            (runDetail ? (runDetail.result || "") + "\n\n--- 完整输出 ---\n" + (runDetail.stdout || "") + (runDetail.stderr ? "\n[stderr]\n" + runDetail.stderr : "") : "暂无日志") + "\n"))),
        create(primitives.Modal, {
          open: logOpen,
          onClose: function () { setLogOpen(false); },
          title: "定时任务 · 操作日志",
          description: "保存/删除/立即运行等操作的日志。",
          footer: create(primitives.Button, { variant: "outline", size: "sm", onClick: function () { setLogOpen(false); } }, "关闭"),
        }, create("pre", { className: "dsh-connect-log" }, (logLines.join("\n") || "暂无日志") + "\n")));
    }

    function RepairSection() {
      var create = react.createElement;
      var useState = react.useState;
      var useEffect = react.useEffect;

      var itemsState = useState([]);
      var items = itemsState[0];
      var setItems = itemsState[1];
      var scanningState = useState(false);
      var scanning = scanningState[0];
      var setScanning = scanningState[1];
      var logOpenState = useState(false);
      var logOpen = logOpenState[0];
      var setLogOpen = logOpenState[1];
      var logState = useState([]);
      var logLines = logState[0];
      var setLogLines = logState[1];

      var api = (typeof window !== "undefined" && window.desktopAPI && window.desktopAPI.repair) ? window.desktopAPI.repair : null;

      var appendLog = function (text) {
        setLogLines(function (prev) { return prev.concat([text]).slice(-120); });
      };

      var scan = function () {
        if (!api) return;
        setScanning(true);
        appendLog("===== 扫描会话历史 =====");
        api.scan().then(function (list) {
          setItems(list || []);
          appendLog("扫描完成，发现 " + (list || []).length + " 个损坏会话。");
        }).catch(function (error) {
          setLogOpen(true);
          appendLog("[错误] " + (error && error.message ? error.message : error));
        }).finally(function () {
          setScanning(false);
        });
      };

      useEffect(function () {
        scan();
      }, []);

      var repair = function (item) {
        if (!api) return;
        setLogOpen(true);
        appendLog("===== 修复 " + item.path + " =====");
        api.run(item.path).then(function (result) {
          appendLog("修复完成：" + (result.ok ? "成功" : "失败") + (result.dropped ? "，删除 " + result.dropped + " 行重复记录" : "") + (result.events !== undefined ? "，事件数 " + result.events : ""));
          if (result.errors && result.errors.length) appendLog("[错误] " + JSON.stringify(result.errors));
          scan();
        }).catch(function (error) {
          appendLog("[错误] " + (error && error.message ? error.message : error));
        });
      };

      return create("div", { className: "dsh-install" },
        create("div", { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 12 } },
          create("h3", { style: { margin: 0, flex: 1, fontSize: 16, color: "var(--dsw-alias-label-primary)" } }, "会话修复"),
          create(primitives.Button, {
            variant: "primary",
            size: "sm",
            disabled: scanning,
            onClick: scan,
          }, scanning ? "扫描中…" : "扫描损坏会话")),
        create("p", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: 13, lineHeight: 1.6 } },
          "扫描 ~/.dsh/sessions 下所有 session.jsonl.zstd，检测历史记录中的 seq 重复/乱序。修复前会自动备份原文件。"),
        items.length === 0
          ? create("p", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: 13 } }, scanning ? "正在扫描…" : "没有发现损坏的会话。")
          : create("div", null,
              items.map(function (item) {
                return create("div", { className: "dsh-install-item", key: item.path },
                  create("div", { className: "info" },
                    create("div", { className: "name" }, item.path.split(/[\\/]/).slice(-3).join("/")),
                    create("div", { className: "meta" }, (item.events !== undefined ? "事件数 " + item.events + " · " : "") + (item.errors && item.errors[0] ? "错误：" + JSON.stringify(item.errors[0]) : ""))),
                  create(primitives.Button, {
                    variant: "primary",
                    size: "sm",
                    onClick: function () { repair(item); },
                  }, "修复"));
              })),
        create(primitives.Modal, {
          open: logOpen,
          onClose: function () { setLogOpen(false); },
          title: "会话修复 · 日志",
          description: "扫描和修复过程的输出。",
          footer: create(primitives.Button, { variant: "outline", size: "sm", onClick: function () { setLogOpen(false); } }, "关闭"),
        }, create("pre", { className: "dsh-connect-log" }, (logLines.join("\n") || "暂无日志") + "\n")));
    }

    var inject = ["slots", "connection"];
    function apply(ctx) {
      hostApi = ctx.get("connection") ? ctx.get("connection").api : null;
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section",
          id: "connect-center",
          order: 70,
          label: "互联"
        }, ConnectSection);
      });
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section",
          id: "plugin-market",
          order: 80,
          label: "插件市场"
        }, MarketSection);
      });
      ctx.slots.inject("settings.plugins.tab", function () {
        return ctx.slots.register({
          name: "settings.plugins.tab",
          id: "install",
          order: 20,
          label: "插件安装"
        }, PluginInstallTab);
      });
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section",
          id: "skills",
          order: 85,
          label: "技能"
        }, SkillSection);
      });
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section",
          id: "scheduler",
          order: 90,
          label: "定时任务"
        }, SchedulerSection);
      });
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section",
          id: "session-repair",
          order: 95,
          label: "会话修复"
        }, RepairSection);
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
