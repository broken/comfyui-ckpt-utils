# comfyui-ckpt-utils
Helpful nodes I've created to work with ComfyUI. Lora Manager is a prerequisite for the Cycler nodes.

## Nodes

*  **Checkpoint Cycler**: Cycles through a list of checkpoints based on a set of filters. Requires Lora Manager.
*  **Lora Cycler**: Cycles through a list of LoRAs based on a set of filters. The difference between this and the one provide by Lora Manager is that the lora is determined at queue time rather than execution time, and is saved in the workflow json for reproducibility.
*  **Tag Parser**: Parses a comma-separated list of tags to extract a typed value for a given label. This allows you to use Lora Manager to tag settings like steps, cfg, sampler, etc. and then use those tags to set optimal values for those settings in your workflow.
*  **Prompt to Prefix**: Hashes a prompt to create unique prefixes based on each prompt to make it easier to identify and organize.
*  **Prompt Selection**: Helpful UI component for creating and selecting from a list of prompts.
