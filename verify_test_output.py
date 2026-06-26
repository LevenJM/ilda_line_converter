#!/usr/bin/env python3
import struct

HEADER_FORMAT = '>4s3sB8s8sHHHBB'
HEADER_SIZE = struct.calcsize(HEADER_FORMAT)

def main():
    with open('test_output.ild', 'rb') as f:
        file_bytes = f.read()
        
    offset = 0
    frame_idx = 0
    
    while offset < len(file_bytes):
        if offset + HEADER_SIZE > len(file_bytes):
            break
        header_data = file_bytes[offset:offset+HEADER_SIZE]
        sig, reserved, format_code, name, company, point_count, frame_num, total_frames, scanner, reserved2 = struct.unpack(HEADER_FORMAT, header_data)
        print(f"\nFrame {frame_idx}:")
        print(f"  Format: {format_code}")
        print(f"  Name: {name.decode('ascii', errors='ignore').strip()}")
        print(f"  Point count: {point_count}")
        
        offset += HEADER_SIZE
        if point_count == 0:
            print("  (Null header / End of file)")
            break
            
        for i in range(point_count):
            pt_bytes = file_bytes[offset + i*6 : offset + (i+1)*6]
            x, y, status, color = struct.unpack('>hhBB', pt_bytes)
            print(f"    Point {i}: X={x}, Y={y}, Status=0x{status:02X}, Color={color}")
            
        offset += point_count * 6
        frame_idx += 1

if __name__ == '__main__':
    main()
