import random
import logging

logger = logging.getLogger(__name__)

class StaticRandomIntCU:
    """Generates a random integer (0 to MAX) only when a button is pressed in the UI."""

    NAME = "Static Random Int"
    CATEGORY = "Lora Manager/utils"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": ("INT", {"default": 0, "min": 0, "max": 1125899906842624}),
            }
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("value",)
    FUNCTION = "get_value"
    OUTPUT_NODE = True

    def get_value(self, value):
        return (value,)
