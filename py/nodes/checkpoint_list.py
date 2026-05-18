import json
import logging

logger = logging.getLogger(__name__)

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

    RETURN_TYPES = ("*", "INT")
    RETURN_NAMES = ("CKPT_NAME", "count")
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

        if data and len(data) > 0:
            # Clamp index to available checkpoints
            actual_index = max(0, min(index, len(data) - 1))
            ckpt_name = data[actual_index]
        else:
            logger.warning("[CheckpointList] No checkpoints defined in ckpt_data.")

        return (ckpt_name, len(data))
