import os
import sys

# Ensure lora-manager submodule is importable without collisions
current_dir = os.path.dirname(os.path.abspath(__file__))
lora_manager_path = os.path.join(current_dir, "lora-manager")

if lora_manager_path not in sys.path:
    sys.path.insert(0, lora_manager_path)

from server import PromptServer
from aiohttp import web
from .py.nodes.checkpoint_cycler import CheckpointCyclerCU, get_metadata
from .py.nodes.lora_cycler import LoraCyclerCU, get_lora_metadata
from .py.nodes.tag_parser import TagParserCU  # Brought over from the user's recent modifications
from .py.nodes.prompt_hasher import PromptHasherCU
from .py.nodes.prompt_selection import PromptSelectionCU
from .py.nodes.lora_stack_update import LoraStackUpdate


@PromptServer.instance.routes.get("/comfyui-ckpt-utils/cycler-metadata")
async def fetch_cycler_metadata(request):
    try:
        data = await get_metadata()
        return web.json_response(data)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.get("/comfyui-ckpt-utils/lora-cycler-metadata")
async def fetch_lora_cycler_metadata(request):
    try:
        data = await get_lora_metadata()
        return web.json_response(data)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

NODE_CLASS_MAPPINGS = {
    CheckpointCyclerCU.NAME: CheckpointCyclerCU,
    LoraCyclerCU.NAME: LoraCyclerCU,
    TagParserCU.NAME: TagParserCU,
    PromptHasherCU.NAME: PromptHasherCU,
    PromptSelectionCU.NAME: PromptSelectionCU,
    LoraStackUpdate.NAME: LoraStackUpdate
}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "WEB_DIRECTORY"]
