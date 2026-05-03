# -*- coding: utf-8 -*-
from pathlib import Path

path = Path(__file__).resolve().parent.parent / "src" / "components" / "picker" / "PickerLichka.jsx"
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)

marker = '      className="picker-tg-chat picker-lichka-thread picker-lichka--flex-mount"'
ret_start = next(i for i, ln in enumerate(lines) if marker in ln)
while ret_start >= 0 and lines[ret_start].strip() != "return (":
    ret_start -= 1
if lines[ret_start].strip() != "return (":
    raise SystemExit(f"return ( not found before thread, at {ret_start}")

end = None
for i in range(len(lines) - 1, ret_start, -1):
    if lines[i].strip() == ");" and lines[i].startswith("  )"):
        j = i + 1
        while j < len(lines) and lines[j].strip() == "":
            j += 1
        if j < len(lines) and lines[j].strip() == "}":
            end = i
            break
if end is None:
    raise SystemExit("closing ); not found")

thread_block = lines[ret_start : end + 1]
thread_block[0] = thread_block[0].replace("return (", "const renderDmThread = () => (", 1)

insert_after = "  }, [profileForm, request, apiBase, t.profileSaved]);\n"
ins_idx = None
for i, ln in enumerate(lines):
    if ln == insert_after:
        ins_idx = i + 1
        break
if ins_idx is None:
    raise SystemExit("insert anchor not found")

early = (
    "\n  if (activePeer && !isDesktop) {\n"
    "    return renderDmThread();\n"
    "  }\n\n"
)

new_lines = lines[:ins_idx] + ["\n"] + thread_block + [early] + lines[ins_idx:ret_start] + lines[end + 1 :]
out = "".join(new_lines)
out = out.replace("  if (!activePeer) {\n", "  if (!activePeer || isDesktop) {\n", 1)
path.write_text(out, encoding="utf-8")
print("OK lines", len(lines), "->", len(new_lines))
