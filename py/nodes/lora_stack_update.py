class LoraStackUpdate:
    """Updates strengths in a lora_stack."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "lora_stack": ("LORA_STACK",),
                "index": ("INT", {"default": -1, "min": -1, "max": 255, "step": 1}),
                "model_strength": ("FLOAT", {"default": 1.0, "min": -20.0, "max": 20.0, "step": 0.01}),
                "clip_strength": ("FLOAT", {"default": 1.0, "min": -20.0, "max": 20.0, "step": 0.01}),
                "use_model_strength": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = ("LORA_STACK",)
    RETURN_NAMES = ("LORA_STACK",)
    FUNCTION = "update_strengths"
    CATEGORY = "Lora Manager/utils"
    NAME = "Lora Stack Update"

    def update_strengths(self, lora_stack, index, model_strength, clip_strength, use_model_strength):
        if not lora_stack:
            return ([],)

        # Create a new list to avoid mutating the original stack if it's shared
        new_stack = list(lora_stack)
        
        final_clip_strength = model_strength if use_model_strength else clip_strength

        # index -1 means update all
        if index == -1:
            for i in range(len(new_stack)):
                name, _, _ = new_stack[i]
                new_stack[i] = (name, model_strength, final_clip_strength)
        elif 0 <= index < len(new_stack):
            name, _, _ = new_stack[index]
            new_stack[index] = (name, model_strength, final_clip_strength)
        
        return (new_stack,)
