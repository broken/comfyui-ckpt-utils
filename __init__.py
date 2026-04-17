import os
import sys

# Ensure lora-manager submodule is importable without collisions
current_dir = os.path.dirname(os.path.abspath(__file__))
lora_manager_path = os.path.join(current_dir, "lora-manager")

if lora_manager_path not in sys.path:
    # Prepend to prioritize this lora-manager if there are conflicts
    sys.path.insert(0, lora_manager_path)

# Import the Node Class
from .py.nodes.checkpoint_cycler import CheckpointCyclerCU
from .py.nodes.tag_parser import TagParserCU

NODE_CLASS_MAPPINGS = {
    CheckpointCyclerCU.NAME: CheckpointCyclerCU,
    TagParserCU.NAME: TagParserCU
}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "WEB_DIRECTORY"]
