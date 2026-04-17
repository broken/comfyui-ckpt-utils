import os
import sys

# Try to replicate folder extraction as in ComfyUI
import sys
sys.path.insert(0, "/Users/dogatech/Development/open.src/ComfyUI")
try:
    import folder_paths
    ckpts = folder_paths.get_filename_list("checkpoints")
    folders = set()
    for c in ckpts:
        if "/" in c:
            folders.add(c.rsplit("/", 1)[0])
        elif "\\" in c:
            folders.add(c.rsplit("\\", 1)[0])
    print("Folders found:", sorted(list(folders)))
except Exception as e:
    print("Failed to get folders:", e)
