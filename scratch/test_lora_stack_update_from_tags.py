import os
import sys
import unittest
from unittest.mock import MagicMock, patch

# Add root directory to sys.path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

# Mock modules
sys.modules["folder_paths"] = MagicMock()
sys.modules["server"] = MagicMock()

from py.nodes.lora_stack_update_from_tags import (
    parse_strength_tags,
    LoraStackUpdateFromTagsCU,
)


class TestLoraStackUpdateFromTags(unittest.TestCase):
    def test_parse_strength_tags(self):
        # 1. Simple str:0.9
        m, c = parse_strength_tags(["str:0.9"])
        self.assertEqual(m, 0.9)
        self.assertEqual(c, 0.9)

        # 2. str: 0.8 with whitespace
        m, c = parse_strength_tags(["str: 0.8", "anime", "character"])
        self.assertEqual(m, 0.8)
        self.assertEqual(c, 0.8)

        # 3. Comma-separated in single tag item
        m, c = parse_strength_tags(["anime, str: 1.2, artstyle"])
        self.assertEqual(m, 1.2)
        self.assertEqual(c, 1.2)

        # 4. str:0.9,0.7 dual strength
        m, c = parse_strength_tags(["str:0.9,0.7"])
        self.assertEqual(m, 0.9)
        self.assertEqual(c, 0.7)

        # 5. Explicit str_model and str_clip
        m, c = parse_strength_tags(["str_model:0.85", "str_clip:0.65"])
        self.assertEqual(m, 0.85)
        self.assertEqual(c, 0.65)

        # 6. Explicit model_str and clip_str
        m, c = parse_strength_tags(["model_str:0.75", "clip_str:0.55"])
        self.assertEqual(m, 0.75)
        self.assertEqual(c, 0.55)

        # 7. No strength tags
        m, c = parse_strength_tags(["anime", "character", "v1.0"])
        self.assertIsNone(m)
        self.assertIsNone(c)

        # 8. Negative strengths
        m, c = parse_strength_tags(["str:-0.5"])
        self.assertEqual(m, -0.5)
        self.assertEqual(c, -0.5)

        # 9. Mixed tags: str:0.8 with explicit str_clip:0.5 override
        m, c = parse_strength_tags(["str:0.8", "str_clip:0.5"])
        self.assertEqual(m, 0.8)
        self.assertEqual(c, 0.5)

        # 10. str_model:0.7 in one tag, str_clip:0.4 in another
        m, c = parse_strength_tags(["str_model:0.7", "str_clip:0.4"])
        self.assertEqual(m, 0.7)
        self.assertEqual(c, 0.4)

    def test_update_strengths_from_tags_node(self):
        node = LoraStackUpdateFromTagsCU()

        # Mock cache data
        mock_cache = MagicMock()
        mock_cache.raw_data = [
            {
                "sub_type": "lora",
                "file_path": "/models/loras/characters/amber.safetensors",
                "tags": ["str:0.85", "genshin"],
            },
            {
                "sub_type": "lora",
                "file_path": "/models/loras/styles/watercolor.safetensors",
                "tags": ["str:0.9,0.6", "art"],
            },
            {
                "sub_type": "lora",
                "file_path": "/models/loras/clothing/dress.safetensors",
                "tags": ["dress", "fashion"],  # No str tag
            },
        ]
        model_roots = ["/models/loras"]

        with patch.object(node, "_fetch_lora_cache", return_value=(mock_cache, model_roots)):
            input_stack = [
                ("characters/amber.safetensors", 1.0, 1.0),
                ("watercolor.safetensors", 1.0, 1.0),
                ("clothing/dress.safetensors", 0.5, 0.5),
                ("unknown_lora.safetensors", 0.7, 0.7),
            ]

            (result_stack,) = node.update_strengths_from_tags(input_stack)

            # Check amber (updated to 0.85, 0.85)
            self.assertEqual(result_stack[0], ("characters/amber.safetensors", 0.85, 0.85))

            # Check watercolor (updated to 0.9, 0.6)
            self.assertEqual(result_stack[1], ("watercolor.safetensors", 0.9, 0.6))

            # Check dress (unchanged 0.5, 0.5 because no str: tag)
            self.assertEqual(result_stack[2], ("clothing/dress.safetensors", 0.5, 0.5))

            # Check unknown (unchanged 0.7, 0.7 because not in cache)
            self.assertEqual(result_stack[3], ("unknown_lora.safetensors", 0.7, 0.7))

            # Ensure input_stack was not mutated
            self.assertEqual(input_stack[0], ("characters/amber.safetensors", 1.0, 1.0))

            # Test backslash path matching and extensionless matching
            stack_with_variants = [
                ("characters\\amber", 1.0, 1.0),
                ("watercolor", 1.0, 1.0),
            ]
            (res_variants,) = node.update_strengths_from_tags(stack_with_variants)
            self.assertEqual(res_variants[0], ("characters\\amber", 0.85, 0.85))
            self.assertEqual(res_variants[1], ("watercolor", 0.9, 0.6))

            # Test empty stack
            self.assertEqual(node.update_strengths_from_tags([])[0], [])
            self.assertEqual(node.update_strengths_from_tags(None)[0], [])


if __name__ == "__main__":
    unittest.main()
