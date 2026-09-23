import os
import sys
import logging
import asyncio
import concurrent.futures

logger = logging.getLogger(__name__)

# Ensure lora-manager is in path
current_dir = os.path.dirname(os.path.abspath(__file__))
extension_dir = os.path.dirname(os.path.dirname(current_dir))
parent_dir = os.path.dirname(extension_dir)
lora_manager_path = os.path.join(parent_dir, "ComfyUI-Lora-Manager")
if not os.path.exists(lora_manager_path):
    lora_manager_path = os.path.join(parent_dir, "lora-manager")

if os.path.exists(lora_manager_path) and lora_manager_path not in sys.path:
    sys.path.insert(0, lora_manager_path)


def _get_service_registry():
    for module_name, module in sys.modules.items():
        if module_name.endswith("py.services.service_registry"):
            if hasattr(module, "ServiceRegistry"):
                return module.ServiceRegistry

    try:
        from py.services.service_registry import ServiceRegistry
        return ServiceRegistry
    except ImportError:
        return None


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


import re


def parse_strength_tags(tags: list) -> tuple[float | None, float | None]:
    """
    Parses strength values from tags.
    Supports formats:
      - str:<val>                  -> sets both model and clip strength
      - str:<model_val>,<clip_val> -> sets model and clip strength individually
      - str_model:<val>            -> sets model strength (takes precedence)
      - str_clip:<val>             -> sets clip strength (takes precedence)
      - model_str:<val>            -> sets model strength (takes precedence)
      - clip_str:<val>             -> sets clip strength (takes precedence)
    """
    if not tags:
        return None, None

    model_strength = None
    clip_strength = None

    # Pass 1: Parse generic str: tags (single or dual)
    for raw_tag in tags:
        if raw_tag is None:
            continue
        tag_str = str(raw_tag).strip()
        if not tag_str:
            continue

        # Dual strength: str:<model_val>,<clip_val>
        m_dual = re.search(r'(?:^|[,\s])str\s*:\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))', tag_str, re.IGNORECASE)
        if m_dual:
            if model_strength is None:
                try:
                    model_strength = float(m_dual.group(1))
                except ValueError:
                    pass
            if clip_strength is None:
                try:
                    clip_strength = float(m_dual.group(2))
                except ValueError:
                    pass

        # Single strength: str:<val>
        m_single = re.search(r'(?:^|[,\s])str\s*:\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))', tag_str, re.IGNORECASE)
        if m_single:
            try:
                val = float(m_single.group(1))
                if model_strength is None:
                    model_strength = val
                if clip_strength is None:
                    clip_strength = val
            except ValueError:
                pass

    # Pass 2: Explicit overrides (str_model, model_str, str_clip, clip_str)
    for raw_tag in tags:
        if raw_tag is None:
            continue
        tag_str = str(raw_tag).strip()
        if not tag_str:
            continue

        m_model = re.search(r'(?:^|[,\s])(?:str_model|model_str)\s*:\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))', tag_str, re.IGNORECASE)
        if m_model:
            try:
                model_strength = float(m_model.group(1))
            except ValueError:
                pass

        m_clip = re.search(r'(?:^|[,\s])(?:str_clip|clip_str)\s*:\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))', tag_str, re.IGNORECASE)
        if m_clip:
            try:
                clip_strength = float(m_clip.group(1))
            except ValueError:
                pass

    return model_strength, clip_strength


class LoraStackUpdateFromTagsCU:
    """Updates model and CLIP strengths in a LORA_STACK using metadata tags from Lora Manager."""

    NAME = "Lora Stack Update From Tags"
    CATEGORY = "Dogatech/Lora Manager"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "lora_stack": ("LORA_STACK",),
            }
        }

    RETURN_TYPES = ("LORA_STACK",)
    RETURN_NAMES = ("LORA_STACK",)
    FUNCTION = "update_strengths_from_tags"

    def _fetch_lora_cache(self):
        async def _get_cache():
            ServiceRegistry = _get_service_registry()
            if not ServiceRegistry:
                return None, []
            scanner = await ServiceRegistry.get_lora_scanner()
            cache = await scanner.get_cached_data()
            model_roots = scanner.get_model_roots()
            return cache, model_roots

        try:
            loop = asyncio.get_running_loop()
            def run_in_thread():
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                try:
                    return new_loop.run_until_complete(_get_cache())
                finally:
                    new_loop.close()
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(run_in_thread)
                return future.result()
        except RuntimeError:
            return asyncio.run(_get_cache())
        except Exception as e:
            logger.warning(f"[LoraStackUpdateFromTags] Failed to retrieve Lora Manager cache: {e}")
            return None, []

    def update_strengths_from_tags(self, lora_stack):
        if not lora_stack:
            return ([],)

        cache, model_roots = self._fetch_lora_cache()
        if not cache or not hasattr(cache, "raw_data") or not cache.raw_data:
            # Fallback: return stack as is if Lora Manager cache cannot be accessed
            return (list(lora_stack),)

        # Build lookup table for lora tags
        lora_lookup = {}
        for item in cache.raw_data:
            st = item.get("sub_type", "lora")
            if st not in ("lora", "lycoris"):
                continue

            file_path = item.get("file_path", "")
            tags = item.get("tags", [])

            formatted_name = _format_model_name_for_comfyui_local(file_path, model_roots)
            base_name = os.path.basename(file_path)
            name_no_ext = os.path.splitext(base_name)[0]
            rel_no_ext = os.path.splitext(formatted_name)[0]

            for key in (
                formatted_name.replace("\\", "/").lower(),
                base_name.lower(),
                name_no_ext.lower(),
                rel_no_ext.replace("\\", "/").lower(),
                os.path.normpath(file_path).lower(),
            ):
                if key and key not in lora_lookup:
                    lora_lookup[key] = tags

        new_stack = []
        for entry in lora_stack:
            if not isinstance(entry, (tuple, list)) or len(entry) < 3:
                new_stack.append(entry)
                continue

            name, model_strength, clip_strength = entry[0], entry[1], entry[2]
            name_str = str(name).strip()
            norm_name = name_str.replace("\\", "/").lower()
            norm_base = os.path.basename(norm_name)
            norm_no_ext = os.path.splitext(norm_base)[0]
            norm_rel_no_ext = os.path.splitext(norm_name)[0]

            matched_tags = None
            for candidate in (norm_name, norm_rel_no_ext, norm_base, norm_no_ext):
                if candidate in lora_lookup:
                    matched_tags = lora_lookup[candidate]
                    break

            if matched_tags:
                tag_model_str, tag_clip_str = parse_strength_tags(matched_tags)
                final_model_str = tag_model_str if tag_model_str is not None else model_strength
                final_clip_str = tag_clip_str if tag_clip_str is not None else clip_strength
                new_stack.append((name, final_model_str, final_clip_str))
            else:
                new_stack.append((name, model_strength, clip_strength))

        return (new_stack,)
