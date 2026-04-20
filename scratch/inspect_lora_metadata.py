import asyncio
import os
import sys

# Ensure lora-manager is in path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(os.path.dirname(current_dir))
lora_manager_path = os.path.join(parent_dir, "ComfyUI-Lora-Manager")
if not os.path.exists(lora_manager_path):
    lora_manager_path = os.path.join(parent_dir, "lora-manager")

if os.path.exists(lora_manager_path) and lora_manager_path not in sys.path:
    sys.path.insert(0, lora_manager_path)

async def inspect():
    from py.services.service_registry import ServiceRegistry
    scanner = await ServiceRegistry.get_lora_scanner()
    cache = await scanner.get_cached_data()
    
    print(f"Total items in cache: {len(cache.raw_data)}")
    sub_types = set()
    for item in cache.raw_data:
        sub_types.add(item.get("sub_type"))
        
    print(f"Sub-types found: {sub_types}")
    
    if len(cache.raw_data) > 0:
        print("Sample item tags:", cache.raw_data[0].get("tags"))
        print("Sample item base_model:", cache.raw_data[0].get("base_model"))

if __name__ == "__main__":
    asyncio.run(inspect())
