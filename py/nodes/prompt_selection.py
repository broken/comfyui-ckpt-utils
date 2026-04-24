import json
import logging

logger = logging.getLogger(__name__)

class PromptSelectionCU:
    """Selects a positive and negative prompt pair from a dynamically managed list."""

    NAME = "Prompt Selection"
    CATEGORY = "Lora Manager/utils"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "index": ("INT", {"default": 0, "min": 0, "max": 999, "control_after_generate": True}),
                # PS_DATA is a custom type handled in JS to create a hidden widget
                "prompt_data": ("PS_DATA", {"default": "[]"}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "INT")
    RETURN_NAMES = ("positive", "negative", "count")
    FUNCTION = "select"
    OUTPUT_NODE = True 

    def select(self, index, prompt_data):
        try:
            # Handle potential escaping or empty strings
            if not prompt_data or prompt_data.strip() == "":
                data = []
            else:
                data = json.loads(prompt_data)
        except Exception as e:
            logger.error(f"[PromptSelection] Failed to parse prompt_data: {e}")
            data = []

        pos_text = ""
        neg_text = ""

        if data and len(data) > 0:
            # Clamp index to available pairs
            actual_index = max(0, min(index, len(data) - 1))
            pair = data[actual_index]
            pos_text = pair.get("pos", "")
            neg_text = pair.get("neg", "")
        else:
            logger.warning("[PromptSelection] No prompt pairs defined in prompt_data.")

        return (pos_text, neg_text, len(data))
