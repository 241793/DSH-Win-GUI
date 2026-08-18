'use strict';

const { app } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
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

def has_provider_model(source):
    return isinstance(source, dict) and isinstance(source.get("provider"), str) and source.get("provider") != "" and isinstance(source.get("model"), str) and source.get("model") != ""

def legacy_message_for_validation(typ, data, seq):
    if not isinstance(data, dict):
        return None
    if typ == "user/message":
        if "id" not in data and "role" not in data and "message" not in data and "content" in data and "source" in data:
            msg = dict(data)
            msg["id"] = "legacy-message:" + str(seq)
            msg["role"] = "user"
            return msg
        return None
    if typ == "assistant/message":
        if "message" not in data and "content" in data and "provenance" in data:
            source = dict(data.get("provenance")) if isinstance(data.get("provenance"), dict) else {}
            source["kind"] = "model"
            return {"id": "legacy-message:" + str(seq), "role": "assistant", "content": data.get("content"), "source": source}
        return None
    if typ == "tool/result":
        if "message" not in data and "callId" in data and "content" in data and "isError" in data:
            return {"id": "legacy-message:" + str(seq), "role": "user",
                    "content": [{"type": "tool-result", "toolCallId": data.get("callId"), "content": data.get("content"), "isError": data.get("isError")}],
                    "source": {"kind": "tool", "callId": data.get("callId")}}
        return None
    return None

def validate_message_event_shape(event, subject):
    typ = event.get("type")
    if typ not in ("user/message", "assistant/message", "tool/result"):
        return
    data = event.get("data")
    record = data if isinstance(data, dict) else None
    message = record if typ == "user/message" else (record.get("message") if isinstance(record, dict) else None)
    legacy_message = legacy_message_for_validation(typ, data, event.get("seq"))
    if legacy_message is not None:
        message = legacy_message
    if not isinstance(message, dict) or not isinstance(message.get("id"), str) or message.get("id") == "":
        raise Exception(f"{subject} lacks an identified message")
    expected_role = "assistant" if typ == "assistant/message" else "user"
    if message.get("role") != expected_role:
        raise Exception(f'{subject} message must have role "{expected_role}"')
    source = message.get("source")
    if not isinstance(source, dict) or not isinstance(source.get("kind"), str) or source.get("kind") == "":
        raise Exception(f"{subject} message has invalid source")
    if not isinstance(message.get("content"), list):
        raise Exception(f"{subject} message has invalid content")
    if typ == "assistant/message":
        if source.get("kind") != "model" or not has_provider_model(source):
            raise Exception(f"{subject} message must have model source")
        return
    if typ != "tool/result":
        return
    if source.get("kind") != "tool" or not isinstance(source.get("callId"), str) or source.get("callId") == "":
        raise Exception(f"{subject} message must have tool source")
    content = message.get("content")
    block = content[0] if content else None
    if len(content) != 1 or not isinstance(block, dict) or block.get("type") != "tool-result" or not isinstance(block.get("content"), list):
        raise Exception(f"{subject} message must contain one tool-result block")
    if block.get("toolCallId") != source.get("callId"):
        raise Exception(f"{subject} message has mismatched tool call ids")

def validate_provenance(event):
    raw = event.get("sourceEventSeqs")
    if raw is None:
        return
    if not isinstance(raw, list):
        raise Exception(f"sourceEventSeqs on event at seq {event.get('seq')} must be an array when present")
    if len(raw) == 0 and event.get("type") != "assistant/message":
        raise Exception("sourceEventSeqs must not be empty except on assistant/message")
    sources = set()
    non_earlier = None
    for source in raw:
        if not isinstance(source, int) or source < 0:
            raise Exception(f'session event "{event.get("type")}" sourceEventSeqs must densely contain non-negative safe integers')
        if source in sources:
            raise Exception("sourceEventSeqs must not contain duplicates")
        sources.add(source)
        if non_earlier is None and source >= event.get("seq", 0):
            non_earlier = source
    if non_earlier is not None:
        raise Exception(f"sourceEventSeqs must reference earlier events: {non_earlier} >= current seq {event.get('seq')}")

def validate_event_shape(event, subject="session event"):
    if not isinstance(event, dict):
        raise Exception(f"{subject} is not an event record")
    validate_message_event_shape(event, subject)
    validate_provenance(event)

def read_seed_length(text):
    try:
        header = json.loads(text.split("\n", 1)[0])
        if isinstance(header, dict) and isinstance(header.get("seedLength"), int):
            return header["seedLength"]
    except Exception:
        pass
    return None

def validate_inbox_splice(state, splice):
    if not isinstance(splice, dict):
        raise Exception("splice data is not an object")
    target = splice.get("target")
    if target not in state:
        raise Exception(f'invalid inbox target "{target}"')
    inbox = state[target]
    start = splice.get("start", 0)
    removed_count = splice.get("removedCount", 0)
    inserted = splice.get("inserted")
    if not isinstance(inserted, list):
        raise Exception("inserted must be an array")
    if not isinstance(start, int) or not isinstance(removed_count, int) or start < 0 or removed_count < 0 or start > len(inbox) or start + removed_count > len(inbox):
        raise Exception("invalid inbox splice")
    candidate = inbox[:start] + inserted + inbox[start + removed_count:]
    ids = set()
    combined = candidate + state["next-step"] if target == "next-turn" else state["next-turn"] + candidate
    for message in combined:
        if not isinstance(message, dict):
            raise Exception("inbox message must be an object")
        mid = message.get("id")
        if mid in ids:
            raise Exception(f'message "{mid}" is already pending')
        ids.add(mid)

def apply_inbox_splice(state, splice):
    validate_inbox_splice(state, splice)
    target = splice["target"]
    start = splice["start"]
    removed_count = splice.get("removedCount", 0)
    inserted = splice.get("inserted", [])
    inbox = state[target]
    state[target] = inbox[:start] + inserted + inbox[start + removed_count:]

def inbox_fix_lines(lines, seed_length=None):
    # Drop persisted agent/inbox/spliced events that cannot be replayed by the
    # agent's Inbox projection. These are usually stray deletions/duplicates
    # left by an interrupted write; dropping them restores a replayable log.
    state = {"next-turn": [], "next-step": []}
    out = []
    dropped = 0
    for line in lines:
        try:
            obj = json.loads(line)
        except Exception:
            out.append(line)
            continue
        if not isinstance(obj, dict):
            out.append(line)
            continue
        events = decode_record(obj)
        invalid = False
        for ev in events:
            if not isinstance(ev, dict) or ev.get("type") != "agent/inbox/spliced":
                continue
            seq = ev.get("seq")
            if seed_length is not None and (not isinstance(seq, int) or seq < seed_length):
                continue
            try:
                apply_inbox_splice(state, ev.get("data"))
            except Exception:
                invalid = True
                break
        if invalid:
            dropped += 1
            continue
        out.append(line)
    return out, dropped

def renumber_lines(lines):
    # Build a global old-seq -> new-seq map, then rewrite every event and every
    # reference (sourceEventSeqs, surfaceOp) through that map. This correctly
    # shifts references to earlier events, unlike per-line delta rewriting.
    seq_map = {}
    next_seq = 0
    for line in lines:
        try:
            obj = json.loads(line)
        except Exception:
            continue
        for ev in decode_record(obj):
            old = ev.get("seq")
            if isinstance(old, int):
                seq_map[old] = next_seq
                next_seq += 1
    out = []
    changed = False
    for line in lines:
        try:
            obj = json.loads(line)
        except Exception:
            out.append(line)
            continue
        if not isinstance(obj, dict):
            out.append(line)
            continue
        before = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
        for key in ("seq", "seq0"):
            v = obj.get(key)
            if isinstance(v, int) and v in seq_map:
                obj[key] = seq_map[v]
        src = obj.get("sourceEventSeqs")
        if isinstance(src, list):
            obj["sourceEventSeqs"] = [seq_map.get(s, s) for s in src]
        op = obj.get("surfaceOp")
        if isinstance(op, dict):
            new_op = dict(op)
            for key in ("start", "end"):
                v = op.get(key)
                if isinstance(v, int) and v in seq_map:
                    new_op[key] = seq_map[v]
            obj["surfaceOp"] = new_op
        after = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
        if after != before:
            changed = True
        out.append(after if after != before else line)
    return out, changed

def semantic_fix_lines(lines):
    # Unknown-tool events were persisted with empty callId, which current session
    # validation rejects. Build a mapping from tool/call seq to a stable non-empty
    # synthetic id, then patch tool/call, tool/result, and assistant tool-call blocks.
    call_id_by_seq = {}
    call_ids_by_turn_step = {}
    for line in lines:
        try:
            obj = json.loads(line)
        except Exception:
            continue
        if not isinstance(obj, dict) or obj.get("type") != "tool/call":
            continue
        data = obj.get("data")
        if not isinstance(data, dict):
            continue
        seq = obj.get("seq")
        turn = data.get("turn")
        step = data.get("step")
        call_id = data.get("callId")
        if not isinstance(call_id, str) or not call_id:
            call_id = "call_unknown_" + str(seq)
        call_id_by_seq[seq] = call_id
        if isinstance(turn, int) and isinstance(step, int):
            call_ids_by_turn_step.setdefault((turn, step), []).append(call_id)
    out = []
    fixed = 0
    for line in lines:
        try:
            obj = json.loads(line)
        except Exception:
            out.append(line)
            continue
        if not isinstance(obj, dict):
            out.append(line)
            continue
        typ = obj.get("type")
        data = obj.get("data")
        changed = False
        if typ == "tool/call" and isinstance(data, dict):
            old = data.get("callId")
            if not isinstance(old, str) or not old:
                data["callId"] = call_id_by_seq.get(obj.get("seq")) or ("call_unknown_" + str(obj.get("seq")))
                changed = True
        elif typ == "tool/result" and isinstance(data, dict):
            message = data.get("message")
            if isinstance(message, dict):
                source = message.get("source")
                content = message.get("content")
                if isinstance(source, dict) and (not isinstance(source.get("callId"), str) or not source.get("callId")):
                    call_id = None
                    refs = obj.get("sourceEventSeqs")
                    if isinstance(refs, list):
                        for s in refs:
                            if s in call_id_by_seq:
                                call_id = call_id_by_seq[s]
                                break
                    if call_id is None:
                        turn = data.get("turn")
                        step = data.get("step")
                        ids = call_ids_by_turn_step.get((turn, step)) if isinstance(turn, int) and isinstance(step, int) else None
                        if ids:
                            call_id = ids[0]
                    if call_id is None:
                        call_id = "call_unknown_" + str(obj.get("seq"))
                    source["callId"] = call_id
                    if isinstance(content, list) and content and isinstance(content[0], dict):
                        content[0]["toolCallId"] = call_id
                    changed = True
        elif typ == "assistant/message" and isinstance(data, dict):
            message = data.get("message")
            if isinstance(message, dict) and isinstance(message.get("content"), list):
                turn = data.get("turn")
                step = data.get("step")
                ids = call_ids_by_turn_step.get((turn, step)) if isinstance(turn, int) and isinstance(step, int) else None
                idx = 0
                for block in message["content"]:
                    if isinstance(block, dict) and block.get("type") == "tool-call":
                        if not isinstance(block.get("id"), str) or not block.get("id"):
                            block["id"] = (ids[idx] if ids and idx < len(ids) else "call_unknown_" + str(obj.get("seq")) + "_" + str(idx))
                            changed = True
                        idx += 1
        if changed:
            out.append(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))
            fixed += 1
        else:
            out.append(line)
    return out, fixed

def verify_contiguous(path):
    with open(path, "rb") as f:
        dctx = zstandard.ZstdDecompressor()
        reader = dctx.stream_reader(f)
        text = io.TextIOWrapper(reader, encoding="utf-8", errors="replace")
        raw_line = 0
        evidx = 0
        prev = None
        errors = []
        seed_length = None
        inbox_state = {"next-turn": [], "next-step": []}
        for line in text:
            raw_line += 1
            if raw_line == 1:
                try:
                    header = json.loads(line)
                    if isinstance(header, dict) and isinstance(header.get("seedLength"), int):
                        seed_length = header["seedLength"]
                except Exception:
                    pass
                continue
            try:
                obj = json.loads(line)
            except Exception as e:
                errors.append({"event": evidx, "prev": prev, "got": None, "line": raw_line, "type": "BADJSON", "detail": str(e)})
                break
            for ev in decode_record(obj):
                if isinstance(ev, dict):
                    subject = "session event at seq " + str(ev.get("seq"))
                else:
                    subject = "session event at index " + str(evidx)
                try:
                    validate_event_shape(ev, subject)
                except Exception as e:
                    errors.append({"event": evidx, "prev": prev, "got": None, "line": raw_line, "type": "SHAPE", "detail": str(e)})
                    if len(errors) >= 5:
                        break
                if isinstance(ev, dict) and ev.get("type") == "agent/inbox/spliced":
                    seq = ev.get("seq")
                    if seed_length is None or (isinstance(seq, int) and seq >= seed_length):
                        try:
                            apply_inbox_splice(inbox_state, ev.get("data"))
                        except Exception as e:
                            errors.append({"event": evidx, "prev": prev, "got": None, "line": raw_line, "type": "INBOX", "detail": f"invalid persisted inbox splice at session seq {seq}: {e}"})
                            if len(errors) >= 5:
                                break
                if isinstance(ev, dict) and prev is not None and ev.get("seq") != prev + 1:
                    errors.append({"event": evidx, "prev": prev, "got": ev.get("seq"), "line": raw_line, "type": obj.get("type")})
                    if len(errors) >= 5:
                        break
                prev = ev.get("seq") if isinstance(ev, dict) else prev
                evidx += 1
            if len(errors) >= 5:
                break
        return evidx, errors

def repair(path):
    if not os.path.exists(path):
        return {"ok": False, "path": path, "error": "文件不存在"}
    backup = path + ".pre-repair-" + str(int(time.time()*1000)) + ".bak"
    shutil.copy2(path, backup)
    text = read_text(path)
    if text.endswith("\n"):
        text = text[:-1]
    lines = text.split("\n")
    header = lines[0]
    seed_length = read_seed_length(text)
    body_lines = lines[1:]
    out_lines = body_lines
    # Do the actual duplicate-drop using decoded event positions.
    final_lines = []
    expected = 0
    dropped = 0
    dropped_inbox = 0
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
    # Drop persisted inbox splices that cannot be replayed (stray deletions etc).
    final_lines, dropped_inbox = inbox_fix_lines(final_lines, seed_length)
    # Handle forward gaps by renumbering through a global old->new seq map.
    # A per-line delta rewrite would miss references to earlier events in the
    # shifted tail and can create self-referencing sourceEventSeqs.
    final_lines, changed = renumber_lines(final_lines)
    # Fix known semantic corruption that the official loader rejects, e.g. empty
    # callId on unknown-tool tool/result events.
    final_lines, shape_fixed = semantic_fix_lines(final_lines)
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
    return {"ok": not errors, "path": path, "backup": backup, "dropped": dropped, "droppedInbox": dropped_inbox, "changed": changed, "shapeFixed": shape_fixed, "events": evidx, "errors": errors}

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
  // Always refresh the embedded script so existing userData caches pick up fixes.
  writeFileSync(file, PYTHON_SCRIPT, 'utf8');
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
