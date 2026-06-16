import sys
import os

# Set up python path to include py/nodes
sys.path.append(os.path.join(os.getcwd(), 'py', 'nodes'))

from csv_to_dict import CSVToDictCU

def run_tests():
    node = CSVToDictCU()
    
    test_cases = [
        # (input_string, expected_output_dict)
        ("", {}),
        ("a:1, b:2, c:3", {"a": "1", "b": "2", "c": "3"}),
        ("a:1, b, c:3", {"a": "1", "b": "", "c": "3"}),
        ("  a  :  1  ,   b   ", {"a": "1", "b": ""}),
        ("url:https://example.com", {"url": "https://example.com"}),
        ("a:1,,b:2", {"a": "1", "b": "2"}),
        ("key:val1:val2, foo:bar", {"key": "val1:val2", "foo": "bar"}),
    ]
    
    success = True
    for idx, (csv_string, expected) in enumerate(test_cases):
        res = node.convert(csv_string)
        # The return value of convert is a tuple: (dict,)
        output_dict = res[0]
        if output_dict == expected:
            print(f"Test {idx + 1} PASSED: {repr(csv_string)} -> {output_dict}")
        else:
            print(f"Test {idx + 1} FAILED!")
            print(f"  Input:    {repr(csv_string)}")
            print(f"  Expected: {expected}")
            print(f"  Got:      {output_dict}")
            success = False
            
    if success:
        print("\nAll tests completed successfully!")
        sys.exit(0)
    else:
        print("\nSome tests failed.")
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
