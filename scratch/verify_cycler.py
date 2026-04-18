import sys
import os
from unittest.mock import MagicMock, patch

# Mock folder_paths before importing node
sys.modules['folder_paths'] = MagicMock()
import folder_paths
folder_paths.get_filename_list.return_value = ["model_a.safetensors", "model_b.safetensors", "model_c.safetensors"]

# Import the node
sys.path.append(os.path.join(os.getcwd(), 'py', 'nodes'))
from checkpoint_cycler import CheckpointCyclerCU

def test_locking():
    node = CheckpointCyclerCU()
    
    # Mocking _get_models which is internal to cycle()
    # Since it's inside cycle(), we'll have to patch the asyncio call or the internal helper if possible.
    # Actually, let's just mock the whole _get_models if it targets ServiceRegistry.
    
    with patch('checkpoint_cycler._get_service_registry') as mock_registry:
        mock_scanner = MagicMock()
        mock_registry.get_checkpoint_scanner.return_value = mock_scanner
        
        # Setup mock models
        models = [
            {"name": "model_a.safetensors", "tags": "tag1, tag2"},
            {"name": "model_b.safetensors", "tags": "tag3"},
            {"name": "model_c.safetensors", "tags": "tag4"}
        ]
        
        # Test 1: Normal cycling with index
        # We need to mock the models resolution. In the actual code it fetches from ServiceRegistry.
        # Let's mock the asyncio match logic.
        
        with patch('checkpoint_cycler.asyncio.run', return_value=models):
            # 1. Normal index-based cycle
            res = node.cycle(
                ckpt_name="Auto (Cycle)",
                base_models="",
                tags_include="",
                tags_exclude="",
                folders_include="",
                folders_exclude="",
                repeats=1,
                current_index=1 # Should be model_b
            )
            print("Test 1 (Index 1):", res['result'][0])
            assert res['result'][0] == "model_b.safetensors"
            
            # 2. Locked cycle (matching current)
            res = node.cycle(
                ckpt_name="Auto (Cycle)",
                base_models="",
                tags_include="",
                tags_exclude="",
                folders_include="",
                folders_exclude="",
                repeats=1,
                current_index=5, # Index says model_c (if it was 2) or wrapped, but lock says model_a
                locked_ckpt_name="model_a.safetensors",
                locked_tags="tag1, tag2"
            )
            print("Test 2 (Locked A, Index 5):", res['result'][0])
            assert res['result'][0] == "model_a.safetensors"
            
            # 3. Locked cycle - Missing model (Should raise FileNotFoundError)
            print("Test 3 (Locked Missing): Expecting FileNotFoundError")
            try:
                node.cycle(
                    ckpt_name="Auto (Cycle)",
                    base_models="",
                    tags_include="",
                    tags_exclude="",
                    folders_include="",
                    folders_exclude="",
                    repeats=1,
                    current_index=1,
                    locked_ckpt_name="missing_model.safetensors"
                )
                print("FAILED: Did not raise FileNotFoundError")
            except FileNotFoundError as e:
                print("SUCCESS: Raised", e)

if __name__ == "__main__":
    test_locking()
