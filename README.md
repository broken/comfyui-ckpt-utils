# comfyui-ckpt-utils
Utility nodes I've created to work with ComfyUI. Lora Manager is a prerequisite for the Cycler nodes.

## Nodes

### Lora Manager extension nodes

*  **Checkpoint Cycler**: Cycles through a list of checkpoints based on a set of filters. Requires Lora Manager.
*  **Lora Stack Update from Tags**: Parses strength values from tags and updates the values in the lora stack. Valid tag formats:
    * `str:<val>` (e.g. str:0.9, str: 0.85): Sets both model and CLIP strength.
    * `str:<model_val>,<clip_val>` (e.g. str:0.9,0.7): Sets model and CLIP strength individually.
    * `str_model:<val>` / `model_str:<val>`: Sets model strength explicitly.
    * `str_clip:<val>` / `clip_str:<val>`: Sets CLIP strength explicitly.

### utils

*  **Tag Parser**: Parses a comma-separated list of tags to extract a typed value for a given label. This allows you to use Lora Manager to tag settings like steps, cfg, sampler, etc. and then use those tags to set optimal values for those settings in your workflow.
*  **Prompt to Prefix**: Hashes a prompt to create unique prefixes based on each prompt to make it easier to identify and organize.
*  **CSV to dict**: Converts a comma-separated string of key:value pairs into a Python dictionary.
*  **String Fallback**: Takes two strings. If the first string is empty or None, the second string is outputted, otherwise, the first string is outputted.

### deprecated

*  **Checkpoint List**: Creates a list of checkpoints.
*  **Lora Cycler**: Cycles through a list of LoRAs based on a set of filters. The difference between this and the one provide by Lora Manager is it output tags & total loras and can filter by favorites.
*  **LoRA Stack Update**: Node which updates the strengths of a lora stack.
*  **Prompt Selection**: Helpful UI component for creating and selecting from a list of prompts.
*  **Static Random Int**: Generates a random integer (0 to MAX) only when a button is pressed in the UI.
