'use strict';

const { randomUUID } = require('node:crypto');
const {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const detector = require('./detector');
const { envWithNodePath, runCapture } = require('./util');

let managedDirsFn = null;
let timer = null;
let running = new Set();

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

function tasksFile() {
  return path.join(dshHome(), 'scheduled-tasks.json');
}

function runsFile() {
  return path.join(dshHome(), 'scheduled-task-runs.jsonl');
}

function readTasks() {
  try {
    const list = JSON.parse(readFileSync(tasksFile(), 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeTasks(tasks) {
  mkdirSync(path.dirname(tasksFile()), { recursive: true });
  writeFileSync(tasksFile(), JSON.stringify(tasks, null, 2));
}

function appendRun(record) {
  try {
    mkdirSync(path.dirname(runsFile()), { recursive: true });
    appendFileSync(runsFile(), `${JSON.stringify(record)}\n`);
  } catch { /* ignore */ }
}

function readRuns(limit = 200) {
  try {
    if (!existsSync(runsFile())) return [];
    const lines = readFileSync(runsFile(), 'utf8').split(/\r?\n/).filter(Boolean);
    const all = lines.map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    return all.slice(-limit).reverse();
  } catch {
    return [];
  }
}

function getRunDetail(id) {
  return readRuns(5000).find((run) => run.id === id) || null;
}

function deleteRun(id) {
  if (!existsSync(runsFile())) return readRuns(200);
  const lines = readFileSync(runsFile(), 'utf8').split(/\r?\n/).filter(Boolean);
  const next = lines.filter((line) => {
    try {
      const rec = JSON.parse(line);
      return rec.id !== id;
    } catch {
      return true;
    }
  });
  writeFileSync(runsFile(), next.length ? `${next.join('\n')}\n` : '');
  return readRuns(200);
}

function nextDailyTime(time, dayOfWeek) {
  const now = new Date();
  const [h, m] = String(time || '08:00').split(':').map(Number);
  const candidate = new Date(now);
  candidate.setHours(h || 0, m || 0, 0, 0);
  if (dayOfWeek !== undefined && dayOfWeek !== null) {
    let diff = (dayOfWeek - now.getDay() + 7) % 7;
    if (diff === 0 && candidate.getTime() <= now.getTime()) diff = 7;
    candidate.setDate(candidate.getDate() + diff);
  } else if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.toISOString();
}

function computeNextRun(task) {
  const s = task.schedule || {};
  if (s.type === 'interval') {
    const minutes = Math.max(1, Number(s.intervalMinutes) || 60);
    return new Date(Date.now() + minutes * 60000).toISOString();
  }
  if (s.type === 'daily') {
    return nextDailyTime(s.time);
  }
  if (s.type === 'weekly') {
    return nextDailyTime(s.time, Number(s.day));
  }
  if (s.type === 'once') {
    return s.runAt ? new Date(s.runAt).toISOString() : null;
  }
  return null;
}

function listTasks() {
  const tasks = readTasks();
  return tasks.map((task) => ({
    ...task,
    nextRunAt: task.enabled ? (task.nextRunAt || computeNextRun(task)) : null,
  }));
}

function saveTask(input) {
  const tasks = readTasks();
  const now = new Date().toISOString();
  let task;
  if (input.id) {
    task = tasks.find((item) => item.id === input.id);
    if (!task) throw new Error('任务不存在');
    Object.assign(task, input, { id: input.id, updatedAt: now });
  } else {
    task = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
    tasks.push(task);
  }
  task.nextRunAt = task.enabled ? computeNextRun(task) : null;
  writeTasks(tasks);
  return listTasks();
}

function deleteTask(id) {
  const tasks = readTasks().filter((item) => item.id !== id);
  writeTasks(tasks);
  return listTasks();
}

function toggleTask(id, enabled) {
  const tasks = readTasks();
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new Error('任务不存在');
  task.enabled = Boolean(enabled);
  if (task.enabled) task.nextRunAt = computeNextRun(task);
  else task.nextRunAt = null;
  task.updatedAt = new Date().toISOString();
  writeTasks(tasks);
  return listTasks();
}

async function runPreScript(script, report) {
  if (!script || !script.trim()) return '';
  report({ type: 'log', message: `执行前置脚本：${script}` });
  const capture = await runCapture(script.trim(), [], {
    shell: true,
    cwd: os.homedir(),
    timeout: 120000,
  });
  if (capture.code !== 0) {
    throw new Error(`前置脚本执行失败（退出码 ${capture.code}）：${capture.stderr || capture.stdout}`);
  }
  return capture.stdout.trim();
}

function buildPatchFile(task) {
  const rows = [];
  if (task.model) {
    const slash = String(task.model).indexOf('/');
    const provider = slash >= 0 ? task.model.slice(0, slash) : 'deepseek-official';
    const model = slash >= 0 ? task.model.slice(slash + 1) : task.model;
    rows.push(`- id: agent-default-model
  config:
    provider: ${provider}
    model: ${model}`);
  }
  if (task.permissionMode) {
    rows.push(`- id: sandbox-policy
  config:
    mode: ${task.permissionMode}`);
    const policy = task.permissionMode === 'danger-full-access' ? 'never' : 'ask';
    rows.push(`- id: approval
  config:
    policy: ${policy}`);
  }
  if (rows.length === 0) return null;
  const dir = path.join(dshHome(), 'scheduled-tasks');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `task-${Date.now()}.patch.yml`);
  writeFileSync(file, rows.join('\n\n'));
  return file;
}

async function runHeadless(task, report) {
  const dirs = managedDirsFn ? managedDirsFn() : null;
  if (!dirs) throw new Error('调度器未初始化');
  const detection = await detector.detectAll(dirs);
  if (!detection.ready || !detection.node || !detection.dsh) {
    throw new Error('运行环境未就绪，无法执行定时任务');
  }
  const nodePath = detection.node.path;
  const binPath = detection.dsh.binPath;

  let prompt = `[这是一个由 DeepSeek Harness 桌面端定时任务系统自动触发的定时任务]\n任务名称：${task.name || '未命名任务'}\n请按以下要求执行。\n\n`;
  if (task.skill) {
    prompt += `请优先使用技能：${task.skill}\n\n`;
  }
  prompt += task.prompt || '';

  if (task.script) {
    const scriptOut = await runPreScript(task.script, report);
    if (scriptOut) {
      prompt += `\n\n[前置脚本输出]\n${scriptOut}`;
    }
  }

  const patchFile = buildPatchFile(task);
  const args = [binPath, '--profile', 'headless'];
  if (patchFile) args.push('--patch', patchFile);
  args.push(prompt);

  report({ type: 'log', message: `执行：dsh --profile headless ${patchFile ? '--patch <临时配置> ' : ''}"${prompt.slice(0, 80)}..."` });
  const capture = await runCapture(nodePath, args, {
    cwd: os.homedir(),
    env: envWithNodePath(nodePath),
    timeout: 600000,
  });
  if (patchFile) rmSync(patchFile, { force: true });
  return capture;
}

async function runTask(task, externalReport) {
  if (running.has(task.id)) return;
  running.add(task.id);
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const record = {
    id: runId,
    taskId: task.id,
    taskName: task.name,
    startedAt,
    finishedAt: null,
    status: 'running',
    exitCode: null,
    result: '',
    stdout: '',
    stderr: '',
    error: '',
  };
  const report = (payload) => {
    if (payload.type === 'log') {
      record.stdout += `[info] ${payload.message}\n`;
    } else if (payload.type === 'output') {
      record.stdout += `${payload.text || ''}\n`;
    }
    if (externalReport) externalReport(payload);
  };

  try {
    const capture = await runHeadless(task, report);
    record.exitCode = capture.code;
    record.result = capture.stdout.trim();
    record.stdout += capture.stdout;
    record.stderr = capture.stderr;
    record.status = capture.code === 0 ? 'success' : 'failed';
    if (capture.code !== 0) {
      record.error = capture.stderr.trim() || `退出码 ${capture.code}`;
    }
  } catch (error) {
    record.status = 'failed';
    record.error = error && error.message ? error.message : String(error);
  } finally {
    record.finishedAt = new Date().toISOString();
    appendRun(record);

    const tasks = readTasks();
    const saved = tasks.find((item) => item.id === task.id);
    if (saved) {
      saved.lastRunAt = startedAt;
      saved.lastStatus = record.status;
      if (saved.schedule && saved.schedule.type === 'once') {
        saved.enabled = false;
        saved.nextRunAt = null;
      } else if (saved.enabled) {
        saved.nextRunAt = computeNextRun(saved);
      }
      saved.updatedAt = new Date().toISOString();
      writeTasks(tasks);
    }
    running.delete(task.id);
  }
}

function tick() {
  const now = Date.now();
  for (const task of readTasks()) {
    if (!task.enabled) continue;
    if (!task.nextRunAt) {
      task.nextRunAt = computeNextRun(task);
      continue;
    }
    if (new Date(task.nextRunAt).getTime() <= now) {
      void runTask(task);
    }
  }
}

/** 让 dsh 知道桌面端具备定时任务功能：向用户 skill 根目录写入一个说明 skill。 */
function ensureDshAwareness() {
  try {
    const root = path.join(dshHome(), 'skills', 'scheduled-task-management');
    const file = path.join(root, 'SKILL.md');
    if (existsSync(file)) return;
    const content = `---
name: scheduled-task-management
description: DeepSeek Harness 桌面端定时任务功能说明。用户可以通过设置页「定时任务」创建、编辑、启用/禁用、立即运行任务，并可查看运行记录和日志。
---

# 定时任务功能（DeepSeek Harness 桌面端）

用户使用的 DeepSeek Harness 桌面端内置了定时任务功能：

- 任务配置保存在：\`~/.dsh/scheduled-tasks.json\`
- 运行记录保存在：\`~/.dsh/scheduled-task-runs.jsonl\`
- 设置页「定时任务」提供任务列表、新建/编辑/删除、启用/禁用、立即运行、运行记录与日志查看。

当用户要求“创建定时任务”“查看定时任务”“立即运行任务”时，请引导用户到桌面端设置页「定时任务」完成。除非用户明确要求，不要直接修改上述配置文件。
`;
    mkdirSync(root, { recursive: true });
    writeFileSync(file, content, 'utf8');
  } catch { /* 忽略写入失败 */ }
}

function startScheduler(fn) {
  managedDirsFn = fn;
  ensureDshAwareness();
  if (timer) clearInterval(timer);
  timer = setInterval(tick, 30000);
  timer.unref && timer.unref();
  tick();
}

function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

function listRuns() {
  return readRuns(200);
}

module.exports = {
  startScheduler,
  stopScheduler,
  listTasks,
  saveTask,
  deleteTask,
  toggleTask,
  listRuns,
  getRunDetail,
  deleteRun,
  runTask,
};
