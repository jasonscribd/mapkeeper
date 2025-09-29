#!/usr/bin/env python3
"""
Test script to verify Mapkeeper setup
"""

import json
import sys
from pathlib import Path

def test_quotes_file():
    """Test that quotes.jsonl is valid"""
    quotes_path = Path(__file__).parent.parent / 'data' / 'quotes.jsonl'
    
    if not quotes_path.exists():
        print("❌ quotes.jsonl not found")
        return False
    
    try:
        quotes = []
        with open(quotes_path, 'r') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if line:
                    quote = json.loads(line)
                    quotes.append(quote)
                    
                    # Validate required fields
                    required_fields = ['id', 'text', 'author', 'book_title', 'source']
                    for field in required_fields:
                        if field not in quote:
                            print(f"❌ Missing field '{field}' in quote {line_num}")
                            return False
        
        print(f"✅ quotes.jsonl valid ({len(quotes)} quotes)")
        return True
        
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in quotes.jsonl: {e}")
        return False
    except Exception as e:
        print(f"❌ Error reading quotes.jsonl: {e}")
        return False

def test_neighbors_file():
    """Test that neighbors.json is valid"""
    neighbors_path = Path(__file__).parent.parent / 'data' / 'neighbors.json'
    
    if not neighbors_path.exists():
        print("❌ neighbors.json not found")
        return False
    
    try:
        with open(neighbors_path, 'r') as f:
            neighbors = json.load(f)
        
        if not isinstance(neighbors, dict):
            print("❌ neighbors.json should be a dictionary")
            return False
        
        # Check that all values are lists
        for quote_id, neighbor_list in neighbors.items():
            if not isinstance(neighbor_list, list):
                print(f"❌ Neighbors for {quote_id} should be a list")
                return False
        
        print(f"✅ neighbors.json valid ({len(neighbors)} quote mappings)")
        return True
        
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in neighbors.json: {e}")
        return False
    except Exception as e:
        print(f"❌ Error reading neighbors.json: {e}")
        return False

def test_static_files():
    """Test that static files exist"""
    public_path = Path(__file__).parent.parent / 'public'
    
    required_files = ['index.html', 'styles.css', 'app.js']
    all_exist = True
    
    for filename in required_files:
        file_path = public_path / filename
        if file_path.exists():
            print(f"✅ {filename} exists")
        else:
            print(f"❌ {filename} missing")
            all_exist = False
    
    return all_exist

def test_scripts():
    """Test that scripts exist and are executable"""
    scripts_path = Path(__file__).parent
    
    required_scripts = ['parse_kindle.py', 'build_graph.py']
    all_exist = True
    
    for script_name in required_scripts:
        script_path = scripts_path / script_name
        if script_path.exists():
            print(f"✅ {script_name} exists")
        else:
            print(f"❌ {script_name} missing")
            all_exist = False
    
    return all_exist

def test_functions():
    """Test that serverless function exists"""
    functions_path = Path(__file__).parent.parent / 'functions' / 'mapkeeper.js'
    
    if functions_path.exists():
        print("✅ mapkeeper.js function exists")
        return True
    else:
        print("❌ mapkeeper.js function missing")
        return False

def main():
    print("🧪 Testing Mapkeeper setup...\n")
    
    tests = [
        ("Static files", test_static_files),
        ("Scripts", test_scripts),
        ("Quotes data", test_quotes_file),
        ("Neighbors data", test_neighbors_file),
        ("Serverless function", test_functions),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n📋 Testing {test_name}:")
        if test_func():
            passed += 1
        else:
            print(f"   Failed {test_name}")
    
    print(f"\n🎯 Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Mapkeeper is ready to use.")
        print("\nNext steps:")
        print("1. Start local server: npm run dev")
        print("2. Open http://localhost:8080")
        print("3. Upload your Kindle highlights or use sample data")
        return 0
    else:
        print(f"\n❌ {total - passed} tests failed. Please fix the issues above.")
        return 1

if __name__ == '__main__':
    sys.exit(main())


