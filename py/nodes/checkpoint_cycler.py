import logging
import folder_paths
import os
import sys
import asyncio

# Ensure lora-manager is in path
current_dir = os.path.dirname(os.path.abspath(__file__))
lora_manager_path = os.path.join(os.path.dirname(os.path.dirname(current_dir)), "lora-manager")
if lora_manager_path not in sys.path:
    sys.path.insert(0, lora_manager_path)

logger = logging.getLogger(__name__)

async def get_metadata():
    """Fetches full cached checkpoints database and compiles base models and tags for the JS UI."""
    from py.services.service_registry import ServiceRegistry
    from py.utils.utils import _format_model_name_for_comfyui
    try:
        scanner = await ServiceRegistry.get_checkpoint_scanner()
        cache = await scanner.get_cached_data()
        model_roots = scanner.get_model_roots()
        
        base_models = set(["Any"])
        tags = set(["[Clear]"]) # Added explicit clear option for the JS appending logic
        
        checkpoints = []
        for item in cache.raw_data:
            if item.get("sub_type") != "checkpoint":
                continue
                
            file_path = item.get("file_path", "")
            formatted_name = _format_model_name_for_comfyui(file_path, model_roots)
            if not formatted_name:
                continue

            bm = str(item.get("base_model", "Unknown"))
            if bm:
                base_models.add(bm)
                
            model_tags = []
            for t in item.get("tags", []):
                if t:
                    tag_str = str(t).lower().strip()
                    tags.add(tag_str)
                    model_tags.append(tag_str)
                    
            folder = ""
            if "/" in formatted_name:
                folder = formatted_name.rsplit("/", 1)[0].lower()
            elif "\\" in formatted_name:
                folder = formatted_name.rsplit("\\", 1)[0].lower()
                    
            checkpoints.append({
                "name": formatted_name,
                "base_model": bm,
                "tags": model_tags,
                "folder": folder
            })
                    
        return {
            "base_models": sorted(list(base_models)),
            "tags": sorted(list(tags)),
            "checkpoints": checkpoints
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"base_models": ["[Clear]", "Any"], "tags": ["[Clear]"], "checkpoints": []}


class CheckpointCyclerCU:
    """Unified Checkpoint Cycler node with builtin filters and state tracking."""

    NAME = "Checkpoint Cycler"
    CATEGORY = "Lora Manager/randomizer"

    @classmethod
    def INPUT_TYPES(cls):
        names = folder_paths.get_filename_list("checkpoints")
        
        folders = set()
        for c in names:
            if "/" in c:
                folders.add(c.rsplit("/", 1)[0].lower())
            elif "\\" in c:
                folders.add(c.rsplit("\\", 1)[0].lower())
                
        folder_list = ["[Clear]", "Any"] + sorted(list(folders))
        base_model_list = ["[Clear]", "Any", "SD1.5", "SDXL", "SD3", "Flux", "SDXL-Turbo", "Pony", "HunyuanVideo", "Unknown"]
        
        return {
            "required": {
                "ckpt_name": (["Auto (Cycle)"] + names, {"default": "Auto (Cycle)"}),
                "base_models": (base_model_list, {"default": "Any"}),
                "tags_include": (["[Clear]", "Any"], {"default": "Any"}),
                "tags_exclude": (["[Clear]", "Any"], {"default": "Any"}),
                "folders_include": (folder_list, {"default": "Any"}),
                "folders_exclude": (folder_list, {"default": "Any"}),
                "repeats": ("INT", {"default": 1, "min": 1, "max": 9999}),
                "current_index": ("INT", {"default": 1, "min": 1, "max": 999999}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "last_selected_ckpt": "STRING",
            }
        }

    RETURN_TYPES = (folder_paths.get_filename_list("checkpoints"), "STRING", "INT")
    RETURN_NAMES = ("CKPT_NAME", "TAGS", "TOTAL_MODELS")
    FUNCTION = "cycle"
    OUTPUT_NODE = False

    def cycle(self, ckpt_name, base_models, tags_include, tags_exclude, folders_include, folders_exclude, repeats, current_index, unique_id=None, last_selected_ckpt=""):
        from py.services.service_registry import ServiceRegistry
        from py.utils.utils import _format_model_name_for_comfyui
        import asyncio
        
        async def _get_models():
            scanner = await ServiceRegistry.get_checkpoint_scanner()
            cache = await scanner.get_cached_data()
            model_roots = scanner.get_model_roots()
            
            inc_t = [t.strip().lower() for t in tags_include.split(',') if t.strip() and t.strip() != "any" and t.strip() != "[clear]"]
            exc_t = [t.strip().lower() for t in tags_exclude.split(',') if t.strip() and t.strip() != "any" and t.strip() != "[clear]"]
            inc_f = [f.strip().replace("\\", "/").lower() for f in folders_include.split(',') if f.strip() and f.strip() != "any" and f.strip() != "[clear]"]
            exc_f = [f.strip().replace("\\", "/").lower() for f in folders_exclude.split(',') if f.strip() and f.strip() != "any" and f.strip() != "[clear]"]
            b_models = [b.strip() for b in base_models.split(',') if b.strip() and b.strip() != "[clear]"]
            
            filtered = []
            for item in cache.raw_data:
                if item.get("sub_type") != "checkpoint":
                    continue
                    
                item_base = str(item.get("base_model", "Unknown"))
                if "Any" not in b_models and b_models and item_base not in b_models:
                    continue
                
                model_tags = [str(t).strip().lower() for t in item.get("tags", [])]
                if inc_t and not all(t in model_tags for t in inc_t):
                    continue
                if exc_t and any(t in model_tags for t in exc_t):
                    continue
                    
                file_path = item.get("file_path", "")
                formatted_name = _format_model_name_for_comfyui(file_path, model_roots)
                
                folder = ""
                if formatted_name:
                    if "/" in formatted_name:
                        folder = formatted_name.rsplit("/", 1)[0].lower()
                    elif "\\" in formatted_name:
                        folder = formatted_name.rsplit("\\", 1)[0].lower()
                        
                if inc_f and not any(f in folder for f in inc_f):
                    continue
                if exc_f and any(f in folder for f in exc_f):
                    continue
                
                if formatted_name:
                    filtered.append({
                        "name": formatted_name,
                        "tags": ", ".join([str(t) for t in item.get("tags", [])])
                    })
                    
            filtered.sort(key=lambda x: x["name"].lower())
            return filtered

        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
        models = loop.run_until_complete(_get_models())
        
        if not models:
            logger.warning("[CheckpointCycler] No models found matching the filters!")
            return {
                "result": ("", "", 0),
                "ui": {
                    "last_selected_ckpt": [""],
                    "current_index": [current_index],
                    "total_count": [0]
                }
            }

        if ckpt_name != "Auto (Cycle)":
            matched_tags = ""
            for m in models:
                if m["name"] == ckpt_name:
                    matched_tags = m["tags"]
                    break
            
            return {
                "result": (ckpt_name, matched_tags, len(models)),
                "ui": {
                    "last_selected_ckpt": [ckpt_name],
                    "current_index": [current_index],
                    "total_count": [len(models)]
                }
            }

        real_idx = max(0, current_index - 1)
        cycle_idx = (real_idx // max(1, repeats)) % len(models)
        
        selected = models[cycle_idx]
        selected_name = selected["name"]
        selected_tags = selected["tags"]
        
        next_index = current_index + 1
        
        return {
            "result": (selected_name, selected_tags, len(models)),
            "ui": {
                "last_selected_ckpt": [selected_name],
                "current_index": [next_index],
                "total_count": [len(models)]
            }
        }
