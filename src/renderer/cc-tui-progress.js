'use strict';

/* global window, document */

const logEl = document.getElementById('cc-tui-log');
const progressBar = document.getElementById('cc-tui-progress-bar');
const progressStage = document.getElementById('cc-tui-stage');
const lines = [];

function stripAnsi(text) {
  return String(text)
    .replace(/\x1b\][^\x07]*?(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function append(payload) {
  let text = '';
  if (payload.type === 'log') {
    text = `[info] ${payload.message || ''}`;
  } else if (payload.type === 'output') {
    text = `${payload.stream === 'stderr' ? '[err] ' : ''}${payload.text || ''}`;
  } else if (payload.type === 'progress') {
    const stageLabel = payload.stage === 'cc-tui' ? 'CC-TUI' : (payload.stage === 'node' ? 'Node.js' : '运行组件');
    const percent = typeof payload.percent === 'number' && payload.percent >= 0 ? payload.percent : -1;
    if (percent >= 0) {
      progressBar.style.width = `${percent}%`;
      progressStage.textContent = `正在下载 ${stageLabel}… ${percent}%`;
    } else if (payload.received) {
      progressStage.textContent = `正在下载 ${stageLabel}… ${(payload.received / 1024 / 1024).toFixed(1)} MB`;
    }
    text = `[进度] ${progressStage.textContent}`;
  } else if (payload.type === 'done') {
    progressBar.style.width = '100%';
    progressStage.textContent = payload.message || '完成';
    text = `[完成] ${progressStage.textContent}`;
  } else {
    return;
  }
  lines.push(stripAnsi(text));
  if (lines.length > 200) lines.splice(0, lines.length - 200);
  logEl.textContent = lines.join('\n');
  logEl.scrollTop = logEl.scrollHeight;
}

window.ccTuiProgress.onProgress(append);
