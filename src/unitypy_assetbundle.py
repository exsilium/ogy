#!/usr/bin/env python3
"""
UnityPy-based AssetBundle updater for the ogy project.
This script uses UnityPy to update assets within Unity AssetBundles.
"""

import sys
import os
import UnityPy
from pathlib import Path


def update_assetbundle(
    original_bundle_path: str,
    original_asset_path: str,
    new_asset_path: str,
    output_bundle_path: str
) -> bool:
    """
    Update an AssetBundle using UnityPy.
    
    Args:
        original_bundle_path: Path to the original AssetBundle file
        original_asset_path: Path to the original asset (to identify which asset to replace)
        new_asset_path: Path to the new asset data to inject
        output_bundle_path: Path where the updated AssetBundle will be written
        
    Returns:
        True if successful, False otherwise
    """
    try:
        print(f"🔄 Loading original bundle: {original_bundle_path}")
        
        # Load the AssetBundle using UnityPy
        env = UnityPy.load(original_bundle_path)
        
        # Read the original and new asset data
        with open(original_asset_path, 'rb') as f:
            original_asset_data = f.read()
        
        with open(new_asset_path, 'rb') as f:
            new_asset_data = f.read()
        
        print(f"📊 Original asset size: {len(original_asset_data)} bytes")
        print(f"📊 New asset size: {len(new_asset_data)} bytes")
        print(f"📊 Size difference: {len(new_asset_data) - len(original_asset_data)} bytes")
        
        # Find and update the TextAsset that contains our data
        asset_found = False
        for obj in env.objects:
            # Check if this is a TextAsset
            if obj.type.name == "TextAsset":
                data = obj.read()
                # Check if this TextAsset contains our original data
                if hasattr(data, 'script') and data.script == original_asset_data:
                    print(f"✅ Found matching TextAsset: {data.name}")
                    # Update the script data with new content
                    data.script = new_asset_data
                    data.save()
                    asset_found = True
                    break
        
        if not asset_found:
            print("⚠️  Warning: Could not find exact TextAsset match, trying fallback method...")
            # Fallback: try to match by size and partial content
            for obj in env.objects:
                if obj.type.name == "TextAsset":
                    data = obj.read()
                    if hasattr(data, 'script'):
                        # Check if sizes are similar (within 10% tolerance)
                        size_ratio = len(data.script) / len(original_asset_data) if len(original_asset_data) > 0 else 0
                        if 0.9 <= size_ratio <= 1.1:
                            print(f"🔍 Found potential TextAsset candidate: {data.name} (size: {len(data.script)})")
                            # Check if first 64 bytes match (simple heuristic)
                            if data.script[:64] == original_asset_data[:64]:
                                print(f"✅ Using TextAsset: {data.name} (partial match)")
                                data.script = new_asset_data
                                data.save()
                                asset_found = True
                                break
        
        if not asset_found:
            print("❌ Error: Could not find the asset to replace in the bundle")
            return False
        
        print(f"💾 Saving updated bundle to: {output_bundle_path}")
        
        # Save the modified bundle
        with open(output_bundle_path, 'wb') as f:
            f.write(env.file.save())
        
        print("✅ AssetBundle updated successfully using UnityPy!")
        return True
        
    except Exception as e:
        print(f"❌ Error updating AssetBundle: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Main entry point for the script."""
    if len(sys.argv) != 5:
        print("Usage: python3 unitypy_assetbundle.py <original_bundle> <original_asset> <new_asset> <output_bundle>")
        sys.exit(1)
    
    original_bundle = sys.argv[1]
    original_asset = sys.argv[2]
    new_asset = sys.argv[3]
    output_bundle = sys.argv[4]
    
    # Validate input files exist
    if not os.path.exists(original_bundle):
        print(f"❌ Error: Original bundle not found: {original_bundle}")
        sys.exit(1)
    
    if not os.path.exists(original_asset):
        print(f"❌ Error: Original asset not found: {original_asset}")
        sys.exit(1)
    
    if not os.path.exists(new_asset):
        print(f"❌ Error: New asset not found: {new_asset}")
        sys.exit(1)
    
    # Run the update
    success = update_assetbundle(original_bundle, original_asset, new_asset, output_bundle)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
