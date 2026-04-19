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
                "index": ("INT", {"default": 0, "min": 0, "max": 999}),
                # prompt_data stores the JSON list of pairs: [{"pos": "...", "neg": "..."}, ...]
                "prompt_data": ("STRING", {"default": "[]", "multiline": True}),
                # These are updated on execution and displayed in the UI as read-only widgets
                "selected_positive": ("STRING", {"default": "", "multiline": True}),
                "selected_negative": ("STRING", {"default": "", "multiline": True}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "select"
    OUTPUT_NODE = True 

    def select(self, index, prompt_data, selected_positive="", selected_negative=""):
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
        actual_index = 0

        if data and len(data) > 0:
            # Clamp index to available pairs
            actual_index = max(0, min(index, len(data) - 1))
            pair = data[actual_index]
            pos_text = pair.get("pos", "")
            neg_text = pair.get("neg", "")
        else:
            logger.warning("[PromptSelection] No prompt pairs defined in prompt_data.")

        # The 'ui' return sends these values back to the frontend widgets
        return {
            "result": (pos_text, neg_text),
            "ui": {
                "selection_info": {
                    "index": actual_index,
                    "positive": pos_text,
                    "negative": neg_text
                }
            }
        }
