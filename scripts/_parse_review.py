import json, sys
raw = open(sys.argv[1], encoding="utf-8", errors="replace").read()
i = raw.find('{"confirmed"')
depth = 0; end = -1; instr = False; esc = False
for j in range(i, len(raw)):
    c = raw[j]
    if esc:
        esc = False; continue
    if c == "\\":
        esc = True; continue
    if c == '"':
        instr = not instr; continue
    if instr:
        continue
    if c == "{":
        depth += 1
    elif c == "}":
        depth -= 1
        if depth == 0:
            end = j + 1; break
data = json.loads(raw[i:end])
print("CONFIRMED:", len(data["confirmed"]))
for k, f in enumerate(data["confirmed"], 1):
    print()
    print("[%d] %s :: %s" % (k, f["severity"].upper(), f["dimension"]))
    print("   ", f["title"])
    print("    @", f["location"], "(conf %s)" % f.get("confidence"))
    print("    FIX:", f["suggested_fix"][:320])
print()
print("REJECTED:", len(data.get("rejected_summary", [])))
for r in data.get("rejected_summary", []):
    print("  -", r["title"][:100])
json.dump(data, open(sys.argv[2], "w"))
