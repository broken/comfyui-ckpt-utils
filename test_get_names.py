import sys
import os

from py.nodes.checkpoint_cycler import CheckpointCyclerCU
names = CheckpointCyclerCU._get_checkpoint_names()
print("NAMES:", names)
