import logging

logger = logging.getLogger(__name__)

class StringFallbackCU:
    """Takes two strings. If the first string is empty or None, the second string is outputted, otherwise, the first string is outputted."""

    NAME = "String Fallback"
    CATEGORY = "Lora Manager/utils"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "string1": ("STRING", {"default": "", "multiline": True}),
                "string2": ("STRING", {"default": "", "multiline": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("string",)
    FUNCTION = "fallback"
    OUTPUT_NODE = False

    def fallback(self, string1, string2):
        if string1 is None or string1 == "":
            return (string2,)
        return (string1,)
