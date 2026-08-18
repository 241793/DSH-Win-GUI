'use strict';

const { app } = require('electron');
const { mkdirSync, writeFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { runCapture } = require('./util');

const PYTHON_SCRIPT = String.raw`# -*- coding: utf-8 -*-
import sys, os, json, io, shutil, time
import zstandard

def decode_record(value):
    if not isinstance(value, dict):
        return [value]
    tag = value.get("type")
    if tag not in ("text-chunks", "reasoning-chunks", "tool-call-chunks"):
        return [value]
    seq0 = value["seq0"]
    time0 = value["time0"]
    data = value["data"]
    members = data["args"] if tag == "tool-call-chunks" else data["texts"]
    dt = data["dt"]
    events = []
    t = time0
    for k, member in enumerate(members):
        if k > 0:
            t += dt[k-1]
        if tag == "tool-call-chunks":
            chunk = {"type": "tool-call-delta", "index": data["index"], "id": data["id"], "argumentsDelta": member}
            if "name" in data:
                chunk["name"] = data["name"]
        elif tag == "text-chunks":
            chunk = {"type": "text-delta", "index": data["index"], "text": member}
        else:
            chunk = {"type": "reasoning-delta", "index": data["index"], "text": member}
        events.append({"type": "assistant/chunk", "seq": seq0 + k, "time": t,
                       "data": {"turn": data["turn"], "step": data["step"], "chunk": chunk}})
    return events

def read_text(path):
    with open(path, "rb") as f:
        dctx = zstandard.ZstdDecompressor()
        reader = dctx.stream_reader(f)
        return reader.read().decode("utf-8", errors="replace")

def verify_contiguous(path):
    with open(path, "rb") as f:
        dctx = zstandard.ZstdDecompressor()
        reader = dctx.stream_reader(f)
        text = io.TextIOWrapper(reader, encoding="utf-8", errors="replace")
        raw_line = 0
        evidx = 0
        prev = None
        errors = []
        for line in text:
            raw_line += 1
            if raw_line == 1:
                continue
            try:
                obj = json.loads(line)
            except Exception as e:
                errors.append({"event": evidx, "prev": prev, "got": None, "line": raw_line, "type": "BADJSON", "detail": str(e)})
                break
            for ev in decode_record(obj):
                if prev is not None and ev.get("seq") != prev + 1:
                    errors.append({"event": evidx, "prev": prev, "got": ev.get("seq"), "line": raw_line, "type": obj.get("type")})
                    if len(errors) >= 5:
                        break
                prev = ev.get("seq")
                evidx += 1
            if len(errors) >= 5:
                break
        return evidx, errors

def transform_record(obj, delta, first_old_seq):
    if not isinstance(obj, dict):
        return obj
    for key in ("seq", "seq0"):
        v = obj.get(key)
        if isinstance(v, int) and v >= first_old_seq:
            obj[key] = v + delta
    src = obj.get("sourceEventSeqs")
    if isinstance(src, list):
        obj["sourceEventSeqs"] = [s + delta if isinstance(s, int) and s >= first_old_seq else s for s in src]
    op = obj.get("surfaceOp")
    if isinstance(op, dict):
        new_op = dict(op)
        for key in ("start", "end"):
            v = op.get(key)
            if isinstance(v, int) and v >= first_old_seq:
                new_op[key] = v + delta
        obj["surfaceOp"] = new_op
    return obj

def repair(path):
    if not os.path.exists(path):
        return {"ok": False, "path": path, "error": "文件不存在"}
    backup = path + ".pre-seqfix-" + str(int(time.time()*1000)) + ".bak"
    shutil.copy2(path, backup)
    text = read_text(path)
    if text.endswith("\n"):
        text = text[:-1]
    lines = text.split("\n")
    header = lines[0]
    body_lines = lines[1:]
    out_lines = []
    dropped = 0
    for line in body_lines:
        try:
            obj = json.loads(line)
        except Exception:
            out_lines.append(line)
            continue
        events = decode_record(obj)
        if not events:
            out_lines.append(line)
            continue
        first_seq = events[0].get("seq")
        if first_seq is None:
            out_lines.append(line)
            continue
        if first_seq <= len(out_lines) - 1 + 0:
            # Drop duplicate/backward records. Use the running kept-event count.
            pass
        out_lines.append(line)
    # Do the actual duplicate-drop using decoded event positions.
    final_lines = []
    expected = 0
    dropped = 0
    for line in out_lines:
        obj = json.loads(line)
        events = decode_record(obj)
        if not events:
            final_lines.append(line)
            continue
        first_seq = events[0].get("seq")
        if first_seq is None:
            final_lines.append(line)
            continue
        if first_seq <= expected - 1:
            dropped += 1
            continue
        final_lines.append(line)
        for ev in events:
            expected = ev.get("seq") + 1
    # Handle forward gaps by renumbering tail.
    out_lines = final_lines
    final_lines = []
    expected = 0
    changed = False
    for line in out_lines:
        obj = json.loads(line)
        events = decode_record(obj)
        if not events:
            final_lines.append(line)
            continue
        first_seq = events[0].get("seq")
        if first_seq is None:
            final_lines.append(line)
            continue
        if first_seq != expected:
            delta = expected - first_seq
            obj = transform_record(obj, delta, first_seq)
            events = decode_record(obj)
            line = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
            changed = True
        final_lines.append(line)
        for ev in events:
            expected = ev.get("seq") + 1
    new_text = header + "\n" + "\n".join(final_lines) + "\n"
    cctx = zstandard.ZstdCompressor(level=3)
    header_frame = cctx.compress((header + "\n").encode("utf-8"))
    body = new_text[len(header) + 1:]
    body_frame = cctx.compress(body.encode("utf-8"))
    fixed = header_frame + body_frame
    tmp = path + ".seqfix-tmp"
    with open(tmp, "wb") as f:
        f.write(fixed)
    os.replace(tmp, path)
    evidx, errors = verify_contiguous(path)
    return {"ok": not errors, "path": path, "backup": backup, "dropped": dropped, "changed": changed, "events": evidx, "errors": errors}

def scan(root):
    results = []
    for dirpath, dirs, files in os.walk(root):
        for fn in files:
            if fn == "session.jsonl.zstd":
                p = os.path.join(dirpath, fn)
                try:
                    evidx, errors = verify_contiguous(p)
                except Exception as e:
                    results.append({"path": p, "events": None, "errors": [{"detail": str(e)}]})
                    continue
                if errors:
                    results.append({"path": p, "events": evidx, "errors": errors[:5]})
    print(json.dumps(results, ensure_ascii=False))

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "scan"
    if mode == "scan":
        root = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.expanduser("~"), ".dsh", "sessions")
        scan(root)
    elif mode == "repair":
        target = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps(repair(target), ensure_ascii=False))
    else:
        print(json.dumps({"ok": False, "error": "unknown mode"}, ensure_ascii=False))
`;

function scriptPath() {
  const dir = path.join(app.getPath('userData'), 'session-repair');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'session-repair.py');
  if (!existsSync(file)) writeFileSync(file, PYTHON_SCRIPT, 'utf8');
  return file;
}

function sessionsRoot() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh', 'sessions');
}

async function runPython(args) {
  const script = scriptPath();
  const capture = await runCapture('python', [script, ...args], { timeout: 300000 });
  if (capture.error) throw new Error(`无法调用 Python：${capture.error.message}`);
  if (capture.code !== 0) {
    throw new Error(`会话修复脚本执行失败（退出码 ${capture.code}）：${capture.stderr || capture.stdout}`);
  }
  const output = capture.stdout.trim();
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`无法解析修复脚本输出：${output.slice(0, 500)}`);
  }
}

async function scanSessions() {
  return runPython(['scan', sessionsRoot()]);
}

async function repairSession(file) {
  return runPython(['repair', file]);
}

module.exports = { scanSessions, repairSession, sessionsRoot, scriptPath, PYTHON_SCRIPT };
