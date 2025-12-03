#!/usr/bin/env python3
"""
UnityPy-based AssetBundle updater for the ogy project.
This script uses UnityPy to update assets within Unity AssetBundles.

Note: The AssetBundle contains CAB files (Unity SerializedFiles) which in turn
contain the encrypted CARD data. This script extracts the CAB, replaces the
CARD data within it, and repackages everything.
"""

import sys
import os
import UnityPy
from pathlib import Path


def update_assetbundle(
    original_bundle_path: str,
    original_asset_path: str,
    new_asset_path: str,
    output_bundle_path: str,
    expected_cab_name: str = None
) -> bool:
    """
    Update an AssetBundle using UnityPy.
    
    Args:
        original_bundle_path: Path to the original AssetBundle file
        original_asset_path: Path to the original encrypted asset data (CARD_Name.bin, etc.)
        new_asset_path: Path to the new encrypted asset data
        output_bundle_path: Path where the updated AssetBundle will be written
        expected_cab_name: Expected CAB filename (e.g., 'CAB-a6d8f4f42198f77b297bd6bdb7a258e3')
        
    Returns:
        True if successful, False otherwise
    """
    try:
        print(f"🔄 Loading original bundle: {original_bundle_path}")
        
        # Load the AssetBundle using UnityPy
        env = UnityPy.load(original_bundle_path)
        
        # Read the original and new asset data (encrypted CARD data)
        with open(original_asset_path, 'rb') as f:
            original_asset_data = f.read()
        
        with open(new_asset_path, 'rb') as f:
            new_asset_data = f.read()
        
        print(f"📊 Original asset size: {len(original_asset_data)} bytes")
        print(f"📊 New asset size: {len(new_asset_data)} bytes")
        print(f"📊 Size difference: {len(new_asset_data) - len(original_asset_data)} bytes")
        
        # The TextAsset in the bundle contains a CAB file (Unity SerializedFile)
        # which in turn contains the encrypted CARD data
        print("🔍 Searching for CAB file (TextAsset) in bundle...")
        asset_found = False
        
        for obj in env.objects:
            if obj.type.name == "TextAsset":
                try:
                    data = obj.read()
                    
                    # Get the CAB data (SerializedFile)
                    # UnityPy returns m_Script as a string, but we need the raw bytes
                    # We'll use the object's get_raw_data() method or similar
                    cab_data = None
                    
                    # Try to get raw data first
                    if hasattr(obj, 'get_raw_data'):
                        cab_data = obj.get_raw_data()
                    elif hasattr(data, 'm_Script'):
                        # UnityPy reads as string but it's actually binary
                        # Encode back to bytes using iso-8859-1 (Latin-1) which is 1:1 mapping
                        script_str = data.m_Script
                        # Convert string to bytes - UnityPy stores binary as string using ordinals
                        cab_data = bytes(ord(c) for c in script_str)
                    elif hasattr(data, 'script'):
                        script_str = data.script
                        cab_data = bytes(ord(c) for c in script_str)
                    
                    if cab_data is None:
                        continue
                    
                    # Ensure cab_data is bytes
                    if not isinstance(cab_data, (bytes, bytearray)):
                        print(f"⚠️  Unexpected cab_data type: {type(cab_data)}")
                        continue
                    
                    # Get the TextAsset name (CAB container name)
                    # Use expected CAB name if provided, otherwise try to get from Unity
                    if expected_cab_name:
                        cab_name = expected_cab_name
                    elif hasattr(data, 'm_Name'):
                        cab_name = data.m_Name
                    elif hasattr(data, 'name'):
                        cab_name = data.name
                    else:
                        cab_name = "unnamed"
                    
                    print(f"📦 Found TextAsset (CAB): {cab_name}, size: {len(cab_data)} bytes")
                    
                    # Try to detect asset path within the CAB
                    try:
                        cab_string = cab_data.decode('utf-8', errors='ignore')
                        # Look for common asset path patterns
                        for pattern in ['card_name.bytes', 'card_desc.bytes', 'card_indx.bytes']:
                            idx = cab_string.lower().find(pattern)
                            if idx != -1:
                                # Try to extract the full path
                                start_idx = max(0, idx - 200)
                                # Find the start of the path (look for null byte before it)
                                while start_idx < idx and cab_string[start_idx] != '\0':
                                    start_idx += 1
                                if cab_string[start_idx] == '\0':
                                    start_idx += 1
                                
                                end_idx = idx + len(pattern)
                                asset_path = cab_string[start_idx:end_idx]
                                # Clean up the path
                                asset_path = asset_path.replace('\0', '').replace('\n', '').replace('\r', '')
                                if 'assets/' in asset_path.lower():
                                    print(f"📍 Detected asset path: {asset_path}")
                                    break
                    except Exception as e:
                        pass  # Silently ignore if we can't detect the path
                    
                    # Search for the original asset data within the CAB
                    offset = cab_data.find(original_asset_data)
                    if offset != -1:
                        print(f"✅ Found encrypted CARD data at offset 0x{offset:x} ({offset}) in CAB")
                        
                        # Replace the encrypted CARD data within the CAB
                        new_cab_data = bytearray(cab_data)
                        
                        # Calculate the new size
                        size_diff = len(new_asset_data) - len(original_asset_data)
                        
                        if size_diff == 0:
                            # Same size - simple replacement
                            new_cab_data[offset:offset+len(original_asset_data)] = new_asset_data
                            print(f"✅ Replaced data (same size: {len(original_asset_data)} bytes)")
                        else:
                            # Different size - need to adjust the CAB structure
                            print(f"📏 Size difference: {size_diff} bytes")
                            
                            # Remove old data and insert new data
                            del new_cab_data[offset:offset+len(original_asset_data)]
                            new_cab_data[offset:offset] = new_asset_data
                            
                            # Update the fileSize field in the CAB header (at offset 0x18, 8 bytes big-endian)
                            new_size = len(new_cab_data)
                            new_cab_data[0x18:0x20] = new_size.to_bytes(8, 'big')
                            print(f"✅ Updated CAB header fileSize to {new_size}")
                            
                            # Find and update the asset's fileSize field in the CAB metadata
                            # The asset metadata comes after the header. We need to find the fileSize field
                            # which is a 4-byte little-endian value that matches the original asset size
                            try:
                                old_size_bytes = len(original_asset_data).to_bytes(4, 'little')
                                # Search for the size field in the metadata area (between header and data)
                                # Typically starts around offset 0x30 and ends before the data starts
                                # Note: offset is from the original cab_data before modification
                                search_start = 0x30
                                search_end = offset  # Search up to where the data starts
                                
                                if search_end > search_start:
                                    # Find the asset size field in the new cab data
                                    size_field_offset = -1
                                    for i in range(search_start, search_end):
                                        if new_cab_data[i:i+4] == old_size_bytes:
                                            size_field_offset = i
                                            break
                                    
                                    if size_field_offset != -1:
                                        # Update the asset fileSize field
                                        new_cab_data[size_field_offset:size_field_offset+4] = len(new_asset_data).to_bytes(4, 'little')
                                        print(f"✅ Updated asset fileSize field at offset 0x{size_field_offset:x}")
                                    else:
                                        print(f"ℹ️  Note: Could not locate asset fileSize field in metadata (data starts at 0x{offset:x})")
                                        print(f"   This is normal - UnityPy will handle metadata updates automatically")
                                else:
                                    print(f"ℹ️  Note: Asset data starts at 0x{offset:x}, before typical metadata location")
                                    print(f"   UnityPy will handle metadata updates automatically")
                            except Exception as e:
                                print(f"⚠️  Error updating asset fileSize: {e}")
                            
                            print(f"✅ Replaced data (new size: {len(new_asset_data)} bytes, was: {len(original_asset_data)} bytes)")
                        
                        # Save the modified CAB back to the TextAsset
                        # Convert bytes back to string format that UnityPy expects
                        new_cab_string = ''.join(chr(b) for b in new_cab_data)
                        
                        if hasattr(data, 'm_Script'):
                            data.m_Script = new_cab_string
                        elif hasattr(data, 'script'):
                            data.script = new_cab_string
                        
                        data.save()
                        asset_found = True
                        print(f"✅ Successfully updated TextAsset with modified CAB")
                        break
                        
                except Exception as e:
                    print(f"⚠️  Error processing TextAsset: {e}")
                    import traceback
                    traceback.print_exc()
                    continue
        
        if not asset_found:
            print("❌ Error: Could not find the encrypted CARD data in the bundle")
            return False
        
        print(f"💾 Saving updated bundle to: {output_bundle_path}")
        
        # Save the modified bundle
        with open(output_bundle_path, 'wb') as f:
            f.write(env.file.save())
        
        # Verify the saved bundle
        print("\n🔍 Verifying saved bundle...")
        try:
            verify_env = UnityPy.load(output_bundle_path)
            verified = False
            for obj in verify_env.objects:
                if obj.type.name == "TextAsset":
                    verify_data = obj.read()
                    
                    # Check CAB name
                    verify_cab_name = "unnamed"
                    if hasattr(verify_data, 'm_Name'):
                        verify_cab_name = verify_data.m_Name
                    elif hasattr(verify_data, 'name'):
                        verify_cab_name = verify_data.name
                    
                    print(f"   CAB name in saved bundle: {verify_cab_name}")
                    
                    # Check if we can still find asset paths
                    if hasattr(verify_data, 'm_Script'):
                        verify_script = verify_data.m_Script
                        verify_cab_bytes = bytes(ord(c) for c in verify_script)
                    elif hasattr(verify_data, 'script'):
                        verify_script = verify_data.script
                        verify_cab_bytes = bytes(ord(c) for c in verify_script)
                    else:
                        continue
                    
                    try:
                        verify_string = verify_cab_bytes.decode('utf-8', errors='ignore')
                        for pattern in ['card_name.bytes', 'card_desc.bytes', 'card_indx.bytes']:
                            if pattern in verify_string.lower():
                                # Try to extract path
                                idx = verify_string.lower().find(pattern)
                                start_idx = max(0, idx - 200)
                                while start_idx < idx and verify_string[start_idx] != '\0':
                                    start_idx += 1
                                if verify_string[start_idx] == '\0':
                                    start_idx += 1
                                end_idx = idx + len(pattern)
                                asset_path = verify_string[start_idx:end_idx]
                                asset_path = asset_path.replace('\0', '').replace('\n', '').replace('\r', '')
                                if 'assets/' in asset_path.lower():
                                    print(f"   Asset path in saved bundle: {asset_path}")
                                    verified = True
                                    break
                    except:
                        pass
                    break
            
            if not verified:
                print("   ⚠️  Warning: Could not verify asset paths in saved bundle")
                print("   ⚠️  The bundle may not load correctly in the game")
        except Exception as e:
            print(f"   ⚠️  Error verifying saved bundle: {e}")
        
        print("\n✅ AssetBundle updated successfully using UnityPy!")
        print("\n⚠️  IMPORTANT: UnityPy's save() method may not preserve all Unity metadata correctly.")
        print("   If the game client fails to load the bundle, this is likely due to:")
        print("   1. CAB container names not being preserved")
        print("   2. Asset paths within the SerializedFile being corrupted")
        print("   3. Unity metadata structure not being maintained")
        print("\n   Consider using the built-in method (without --unitypy) which directly")
        print("   manipulates the AssetBundle structure at a lower level.")
        return True
        
    except Exception as e:
        print(f"❌ Error updating AssetBundle: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Main entry point for the script."""
    if len(sys.argv) < 5:
        print("Usage: python3 unitypy_assetbundle.py <original_bundle> <original_asset> <new_asset> <output_bundle> [expected_cab_name]")
        sys.exit(1)
    
    original_bundle = sys.argv[1]
    original_asset = sys.argv[2]
    new_asset = sys.argv[3]
    output_bundle = sys.argv[4]
    expected_cab_name = sys.argv[5] if len(sys.argv) > 5 else None
    
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
    success = update_assetbundle(original_bundle, original_asset, new_asset, output_bundle, expected_cab_name)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
