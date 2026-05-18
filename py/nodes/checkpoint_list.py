import json
import logging
import os
import sys

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
    import sys
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

class CheckpointListCU:
    """Selects a checkpoint from a dynamically managed list using an index."""

    NAME = "Checkpoint List"
    CATEGORY = "Lora Manager/utils"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "index": ("INT", {"default": 0, "min": 0, "max": 999, "control_after_generate": True}),
                # CL_DATA is a custom type handled in JS to create a hidden widget
                "ckpt_data": ("CL_DATA", {"default": "[]"}),
            }
        }

    RETURN_TYPES = ("*", "STRING", "INT")
    RETURN_NAMES = ("CKPT_NAME", "TAGS", "TOTAL_MODELS")
    FUNCTION = "select"
    OUTPUT_NODE = True 

    def select(self, index, ckpt_data):
        try:
            # Handle potential escaping or empty strings
            if not ckpt_data or ckpt_data.strip() == "":
                data = []
            else:
                data = json.loads(ckpt_data)
        except Exception as e:
            logger.error(f"[CheckpointList] Failed to parse ckpt_data: {e}")
            data = []

        ckpt_name = ""
        tags = ""

        if data and len(data) > 0:
            # Clamp index to available checkpoints
            actual_index = max(0, min(index, len(data) - 1))
            ckpt_name = data[actual_index]

            if ckpt_name:
                try:
                    import asyncio
                    async def _get_tags():
                        ServiceRegistry = _get_service_registry()
                        scanner = await ServiceRegistry.get_checkpoint_scanner()
                        cache = await scanner.get_cached_data()
                        model_roots = scanner.get_model_roots()
                        
                        for item in cache.raw_data:
                            if item.get("sub_type") not in ("checkpoint", "diffusion_model"):
                                continue
                            file_path = item.get("file_path", "")
                            formatted_name = _format_model_name_for_comfyui_local(file_path, model_roots)
                            if formatted_name == ckpt_name:
                                return ", ".join([str(t) for t in item.get("tags", [])])
                        return ""

                    # Run async function safely in thread/loop
                    try:
                        loop = asyncio.get_running_loop()
                        import concurrent.futures
                        def run_in_thread():
                            new_loop = asyncio.new_event_loop()
                            asyncio.set_event_loop(new_loop)
                            try:
                                return new_loop.run_until_complete(_get_tags())
                            finally:
                                new_loop.close()
                        with concurrent.futures.ThreadPoolExecutor() as executor:
                            future = executor.submit(run_in_thread)
                            tags = future.result()
                    except RuntimeError:
                        tags = asyncio.run(_get_tags())
                except Exception as db_err:
                    logger.error(f"[CheckpointList] Failed to fetch tags from database: {db_err}")
        else:
            logger.warning("[CheckpointList] No checkpoints defined in ckpt_data.")

        return (ckpt_name, tags or "", len(data))
