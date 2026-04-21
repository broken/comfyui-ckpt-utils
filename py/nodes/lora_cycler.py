import logging
import folder_paths
import os
import sys
import asyncio

# Ensure lora-manager is in path
current_dir = os.path.dirname(os.path.abspath(__file__))
extension_dir = os.path.dirname(os.path.dirname(current_dir))
parent_dir = os.path.dirname(extension_dir)
lora_manager_path = os.path.join(parent_dir, "ComfyUI-Lora-Manager")
if not os.path.exists(lora_manager_path):
    lora_manager_path = os.path.join(parent_dir, "lora-manager")

if os.path.exists(lora_manager_path) and lora_manager_path not in sys.path:
    sys.path.insert(0, lora_manager_path)

logger = logging.getLogger(__name__)

def _get_service_registry():
    # Search loaded modules to avoid creating duplicate singleton scopes on 'py' namespaces
    for module_name, module in sys.modules.items():
        if module_name.endswith("py.services.service_registry"):
            if hasattr(module, "ServiceRegistry"):
                return module.ServiceRegistry
                
    # Fallback if not physically located
    from py.services.service_registry import ServiceRegistry
    return ServiceRegistry

def _format_model_name_for_comfyui_local(file_path: str, model_roots: list) -> str:
    for root in model_roots:
        try:
            norm_file = os.path.normcase(os.path.abspath(file_path))
            norm_root = os.path.normcase(os.path.abspath(root))
            if not norm_root.endswith(os.sep):
                norm_root += os.sep
            if norm_file.startswith(norm_root):
                return os.path.relpath(file_path, root).replace("\\", "/")
        except Exception:
            continue
    return os.path.basename(file_path)

async def get_lora_metadata():
    """Fetches full cached loras database and compiles base models and tags for the JS UI."""
    try:
        ServiceRegistry = _get_service_registry()
        scanner = await ServiceRegistry.get_lora_scanner()
        cache = await scanner.get_cached_data()
        model_roots = scanner.get_model_roots()
        
        base_models = set()
        tags = set()
        
        loras = []
        for item in cache.raw_data:
            # For loras, sub_type is usually 'lora', but might be missing in older caches or if not set in LoraMetadata
            st = item.get("sub_type", "lora")
            if st not in ("lora", "lycoris"):
                continue
                
            file_path = item.get("file_path", "")
            formatted_name = _format_model_name_for_comfyui_local(file_path, model_roots)
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
                    
            loras.append({
                "name": formatted_name,
                "base_model": bm,
                "tags": model_tags,
                "folder": folder,
                "favorite": bool(item.get("favorite", False))
            })
                    
        return {
            "base_models": sorted(list(base_models)),
            "tags": sorted(list(tags)),
            "loras": loras
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"base_models": [], "tags": [], "loras": []}


class LoraCyclerCU:
    """Unified Lora Cycler node with builtin filters and state tracking."""

    NAME = "Lora Cycler"
    CATEGORY = "Lora Manager/randomizer"

    @classmethod
    def INPUT_TYPES(cls):
        names = folder_paths.get_filename_list("loras")
        
        return {
            "required": {
                "lora_name": (names, {"default": names[0] if names else ""}),
                "strength_model": ("FLOAT", {"default": 1.0, "min": -20.0, "max": 20.0, "step": 0.01}),
                "strength_clip": ("FLOAT", {"default": 1.0, "min": -20.0, "max": 20.0, "step": 0.01}),
                "base_models": ("LC_BASE_MODELS", {"default": ""}),
                "tags_include": ("LC_TAGS_INCLUDE", {"default": ""}),
                "tags_exclude": ("LC_TAGS_EXCLUDE", {"default": ""}),
                "folders_include": ("LC_FOLDERS_INCLUDE", {"default": ""}),
                "folders_exclude": ("LC_FOLDERS_EXCLUDE", {"default": ""}),
                "favorites_only": ("BOOLEAN", {"default": False}),
                "include_no_lora": ("BOOLEAN", {"default": True}),
                "repeats": ("INT", {"default": 1, "min": 1, "max": 9999}),
                "current_index": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "control_after_generate": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "last_selected_lora": "STRING",
                "locked_lora_name": "STRING",
                "locked_tags": "STRING",
            }
        }

    RETURN_TYPES = ("LORA_STACK", "*", "STRING", "INT")
    RETURN_NAMES = ("LORA_STACK", "LORA_NAME", "TAGS", "TOTAL_LORAS")
    FUNCTION = "cycle"
    OUTPUT_NODE = True

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        import time
        return time.time()

    def cycle(self, lora_name, strength_model, strength_clip, base_models, tags_include, tags_exclude, folders_include, folders_exclude, favorites_only, include_no_lora, repeats, current_index, unique_id=None, last_selected_lora="", locked_lora_name="", locked_tags=""):
        import asyncio
        
        async def _get_models():
            ServiceRegistry = _get_service_registry()
            scanner = await ServiceRegistry.get_lora_scanner()
            cache = await scanner.get_cached_data()
            model_roots = scanner.get_model_roots()
            
            inc_t = [t.strip().lower() for t in str(tags_include).split(',') if t.strip()]
            exc_t = [t.strip().lower() for t in str(tags_exclude).split(',') if t.strip()]
            inc_f = [f.strip().replace("\\", "/").lower() for f in str(folders_include).split(',') if f.strip()]
            exc_f = [f.strip().replace("\\", "/").lower() for f in str(folders_exclude).split(',') if f.strip()]
            b_models = [b.strip() for b in str(base_models).split(',') if b.strip()]
            
            filtered = []
            for item in cache.raw_data:
                st = item.get("sub_type", "lora")
                if st not in ("lora", "lycoris"):
                    continue
                    
                item_base = str(item.get("base_model", "Unknown"))
                if b_models and item_base not in b_models:
                    continue
                
                if favorites_only and not item.get("favorite", False):
                    continue

                model_tags = [str(t).strip().lower() for t in item.get("tags", [])]
                if inc_t and not all(t in model_tags for t in inc_t):
                    continue
                if exc_t and any(t in model_tags for t in exc_t):
                    continue
                    
                file_path = item.get("file_path", "")
                formatted_name = _format_model_name_for_comfyui_local(file_path, model_roots)
                
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
            
            if include_no_lora:
                filtered.insert(0, {"name": "None", "tags": ""})
                
            return filtered

        try:
            loop = asyncio.get_running_loop()
            import concurrent.futures
            def run_in_thread():
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                try:
                    return new_loop.run_until_complete(_get_models())
                finally:
                    new_loop.close()
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(run_in_thread)
                models = future.result()
        except RuntimeError:
            models = asyncio.run(_get_models())
        
        if not models:
            logger.warning("[LoraCycler] No loras found matching the filters!")
            return {
                "result": ([], "None", "", 0),
                "ui": {
                    "last_selected_lora": ["None"],
                    "current_index": [current_index],
                    "total_count": [0]
                }
            }

        # 1. Determine target lora
        # We always follow current_index as the source of truth.
        real_idx = max(0, current_index)
        cycle_idx = (real_idx // max(1, repeats)) % len(models)
        selected = models[cycle_idx]
        target_name = selected["name"]
        target_tags = selected["tags"]

        # 2. Create lora_stack
        lora_stack = []
        if target_name and target_name != "None":
            lora_stack.append((target_name, strength_model, strength_clip))
        
        return {
            "result": (lora_stack, target_name, target_tags or "", len(models)),
            "ui": {
                "lora_name": [target_name],
                "last_selected_lora": [target_name],
                "total_count": [len(models)]
            }
        }
