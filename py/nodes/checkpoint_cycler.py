import logging
import asyncio
import os
import sys

# Ensure lora-manager is in path
current_dir = os.path.dirname(os.path.abspath(__file__))
lora_manager_path = os.path.join(os.path.dirname(os.path.dirname(current_dir)), "lora-manager")
if lora_manager_path not in sys.path:
    sys.path.insert(0, lora_manager_path)

logger = logging.getLogger(__name__)

class CheckpointCyclerCU:
    """Unified Checkpoint Cycler node with builtin filters and state tracking."""

    NAME = "Checkpoint Cycler"
    CATEGORY = "Lora Manager/randomizer"

    @classmethod
    def _get_checkpoint_names(cls):
        try:
            from py.services.service_registry import ServiceRegistry
            from py.utils.utils import _format_model_name_for_comfyui
            
            async def _get_names():
                scanner = await ServiceRegistry.get_checkpoint_scanner()
                cache = await scanner.get_cached_data()
                model_roots = scanner.get_model_roots()

                names = []
                for item in cache.raw_data:
                    # filter by checkpoint sub_type
                    if item.get("sub_type") == "checkpoint":
                        file_path = item.get("file_path", "")
                        if file_path:
                            formatted_name = _format_model_name_for_comfyui(file_path, model_roots)
                            if formatted_name:
                                names.append(formatted_name)
                return sorted(names)

            loop = asyncio.get_running_loop()
            import concurrent.futures
            
            def run_in_thread():
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                try:
                    return new_loop.run_until_complete(_get_names())
                finally:
                    new_loop.close()

            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(run_in_thread)
                return future.result()
        except Exception as e:
            logger.error(f"[CheckpointCycler] Error getting checkpoint names for UI: {e}")
            return []

    @classmethod
    def INPUT_TYPES(cls):
        # We fetch ckpt names to populate the manual override combo box.
        names = cls._get_checkpoint_names()
        return {
            "required": {
                "ckpt_name": (["Auto (Cycle)"] + names, {"default": "Auto (Cycle)"}),
                "base_model": (["Any", "SD1.5", "SDXL", "SD3", "Flux", "SDXL-Turbo", "Pony", "HunyuanVideo", "Unknown"], {"default": "Any"}),
                "tags_include": ("STRING", {"default": ""}),
                "tags_exclude": ("STRING", {"default": ""}),
                "folders_include": ("STRING", {"default": ""}),
                "folders_exclude": ("STRING", {"default": ""}),
                "repeats": ("INT", {"default": 1, "min": 1, "max": 9999}),
                "current_index": ("INT", {"default": 1, "min": 1, "max": 999999}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "last_selected_ckpt": "STRING",
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("CKPT_NAME", "TAGS")
    FUNCTION = "cycle"
    OUTPUT_NODE = False

    def cycle(self, ckpt_name, base_model, tags_include, tags_exclude, folders_include, folders_exclude, repeats, current_index, unique_id=None, last_selected_ckpt=""):
        from py.services.service_registry import ServiceRegistry
        from py.utils.utils import _format_model_name_for_comfyui
        import asyncio
        
        async def _get_models():
            scanner = await ServiceRegistry.get_checkpoint_scanner()
            cache = await scanner.get_cached_data()
            model_roots = scanner.get_model_roots()
            
            # Pre-parse filters
            inc_t = [t.strip().lower() for t in tags_include.split(',') if t.strip()]
            exc_t = [t.strip().lower() for t in tags_exclude.split(',') if t.strip()]
            inc_f = [f.strip().lower() for f in folders_include.split(',') if f.strip()]
            exc_f = [f.strip().lower() for f in folders_exclude.split(',') if f.strip()]
            
            filtered = []
            for item in cache.raw_data:
                if item.get("sub_type") != "checkpoint":
                    continue
                    
                # Base model filter
                item_base = str(item.get("base_model", "Unknown"))
                if base_model != "Any" and item_base != base_model:
                    continue
                
                # Tags Filter
                model_tags = [str(t).strip().lower() for t in item.get("tags", [])]
                if inc_t and not all(t in model_tags for t in inc_t):
                    continue
                if exc_t and any(t in model_tags for t in exc_t):
                    continue
                    
                # Folders Filter
                folder = str(item.get("folder", "")).lower()
                if inc_f and not any(f in folder for f in inc_f):
                    continue
                if exc_f and any(f in folder for f in exc_f):
                    continue
                    
                file_path = item.get("file_path", "")
                formatted_name = _format_model_name_for_comfyui(file_path, model_roots)
                
                if formatted_name:
                    filtered.append({
                        "name": formatted_name,
                        "tags": ", ".join([str(t) for t in item.get("tags", [])])
                    })
                    
            # Sort by name alphabetically to ensure deterministic cycling
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
            # Fallback to an empty string to prevent total crash, or default Checkpoint
            return {
                "result": ("", ""),
                "ui": {
                    "last_selected_ckpt": [""],
                    "current_index": [current_index],
                    "total_count": [0]
                }
            }

        # 1. Manual check
        if ckpt_name != "Auto (Cycle)":
            # Attempt to find the manual checkpoint tags if possible
            matched_tags = ""
            for m in models:
                if m["name"] == ckpt_name:
                    matched_tags = m["tags"]
                    break
            
            return {
                "result": (ckpt_name, matched_tags),
                "ui": {
                    "last_selected_ckpt": [ckpt_name],
                    "current_index": [current_index], # leave index untouched
                    "total_count": [len(models)]
                }
            }

        # 2. Cycle Logic
        # We compute the effective index mapping.
        # math: (current_index - 1) // repeats
        # then we map that to the list size.
        
        real_idx = max(0, current_index - 1)
        cycle_idx = (real_idx // max(1, repeats)) % len(models)
        
        selected = models[cycle_idx]
        selected_name = selected["name"]
        selected_tags = selected["tags"]
        
        # Determine the next index to pass to frontend for updating
        next_index = current_index + 1
        
        return {
            "result": (selected_name, selected_tags),
            "ui": {
                "last_selected_ckpt": [selected_name],
                "current_index": [next_index],
                "total_count": [len(models)]
            }
        }
