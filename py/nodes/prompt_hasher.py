import hashlib

class PromptHasherCU:
    """Generates a deterministic 9-character alphanumeric hash from a prompt string."""

    NAME = "Prompt to Prefix"
    CATEGORY = "Lora Manager/utils"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"multiline": True, "forceInput": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("filename_prefix",)
    FUNCTION = "generate_hash"
    OUTPUT_NODE = False

    def generate_hash(self, prompt):
        # Ensure prompt is a string
        prompt_str = str(prompt)
        
        # Hash the prompt using SHA-256
        hash_object = hashlib.sha256(prompt_str.encode('utf-8'))
        hash_int = int(hash_object.hexdigest(), 16)
        
        # Take modulo 36^9 to get a value within the range of 9 base-36 characters
        # 36^9 = 101,559,956,668,416 (approx 10^14)
        num = hash_int % (36**9)
        
        # Convert to base 36 (0-9, a-z)
        chars = "0123456789abcdefghijklmnopqrstuvwxyz"
        base36 = ""
        for _ in range(9):
            base36 = chars[num % 36] + base36
            num //= 36
            
        return (base36,)
