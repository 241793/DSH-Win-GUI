'use strict';

/* global window, document */

const logEl = document.getElementById('update-log');
const progressBar = document.getElementById('update-progress-bar');
const progressStage = document.getElementById('update-stage');
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
  } else if (payload.type === 'done') {
    progressBar.style.width = '100%';
    progressStage.textContent = payload.message || '更新完成';
    text = `[完成] ${progressStage.textContent}`;
  } else {
    return;
  }
  lines.push(stripAnsi(text));
  if (lines.length > 200) lines.splice(0, lines.length - 200);
  logEl.textContent = lines.join('\n');
  logEl.scrollTop = logEl.scrollHeight;
}

window.updateProgress.onProgress(append);
