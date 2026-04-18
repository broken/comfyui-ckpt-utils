class TagParserCU:
    """Parses a comma-separated list of tags to extract a typed value for a given label."""

    NAME = "Tag Parser"
    CATEGORY = "Lora Manager/utils"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "tags": ("STRING", {"forceInput": True}),
                "label": ("STRING", {"default": "steps", "multiline": False}),
                "default": ("STRING", {"default": "20", "multiline": False}),
            }
        }

    RETURN_TYPES = ("BOOLEAN", "INT", "FLOAT", "STRING")
    RETURN_NAMES = ("BOOLEAN", "INT", "FLOAT", "STRING")
    FUNCTION = "parse"
    OUTPUT_NODE = False

    def parse(self, tags, label, default):
        tags = str(tags)
        label = str(label)
        default = str(default)
        tag_list = [t.strip() for t in tags.split(',') if t.strip()]
        
        target_prefix = f"{label}:"
        found_val_str = None
        
        # Priority 1: Exact label:value match
        for tag in tag_list:
            if tag.startswith(target_prefix):
                found_val_str = tag[len(target_prefix):].strip()
                break
        
        # Priority 2: Presence check (exact label match)
        if found_val_str is None:
            for tag in tag_list:
                if tag.lower() == label.lower():
                    found_val_str = "true"
                    break
                
        if found_val_str is None:
            found_val_str = default
            
        # BOOLEAN
        bool_val = False
        lower_str = found_val_str.lower()
        if lower_str in ("true", "1", "yes", "y", "on"):
            bool_val = True
            
        # INT
        int_val = 0
        try:
            int_val = int(found_val_str)
        except ValueError:
            pass
            
        # FLOAT
        float_val = 0.0
        try:
            float_val = float(found_val_str)
        except ValueError:
            pass
            
        # STRING
        str_val = found_val_str
        
        return (bool_val, int_val, float_val, str_val)
