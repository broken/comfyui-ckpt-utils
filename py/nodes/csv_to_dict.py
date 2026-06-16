import logging

logger = logging.getLogger(__name__)

class CSVToDictCU:
    """Converts a comma-separated string of key:value pairs into a Python dictionary."""

    NAME = "CSV to Dict"
    CATEGORY = "Lora Manager/utils"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "csv_string": ("STRING", {"default": "", "multiline": True}),
            }
        }

    RETURN_TYPES = ("DICT",)
    RETURN_NAMES = ("dict",)
    FUNCTION = "convert"
    OUTPUT_NODE = False

    def convert(self, csv_string):
        result = {}
        if not csv_string:
            return (result,)
        
        # Split by comma
        items = csv_string.split(",")
        for item in items:
            item = item.strip()
            if not item:
                continue
            
            # Split by first colon
            if ":" in item:
                key, val = item.split(":", 1)
                result[key.strip()] = val.strip()
            else:
                # Key only, store with empty string as value
                result[item.strip()] = ""
                
        return (result,)
