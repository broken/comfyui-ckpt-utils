import sys
import os

try:
    import folder_paths
    print("Has folder_paths")
    ckpts = folder_paths.get_filename_list("checkpoints")
    print("Found", len(ckpts))
    
    def get_folders():
        folders = set()
        for c in ckpts:
            if "/" in c:
                folders.add(c.rsplit("/", 1)[0])
            if "\\" in c:
                folders.add(c.rsplit("\\", 1)[0])
        return sorted(list(folders))
        
    print("Folders:", get_folders())
except Exception as e:
    print("Failed running mock:", e)
