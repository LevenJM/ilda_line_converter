#!/usr/bin/env python3
import struct

# Write a simple Format 1 (2D Indexed Color) ILDA file
# It will have one frame with 4 points:
# Point 1: Y = -1000 (out of band for 0..15000)
# Point 2: Y = 0 (in band)
# Point 3: Y = 5000 (in band)
# Point 4: Y = 20000 (out of band for 0..15000)

HEADER_FORMAT = '>4s3sB8s8sHHHBB'

def main():
    points = [
        # X, Y, Status, Color index
        (100, -1000, 0, 1),
        (200, 0, 0, 1),
        (300, 5000, 0, 1),
        (400, 20000, 0x80, 1) # last point
    ]
    
    header = struct.pack(
        HEADER_FORMAT,
        b'ILDA',
        b'\x00\x00\x00',
        1,          # format 1
        b'TESTFRM\x00',
        b'COMPANY\x00',
        len(points),# point count
        0,          # frame number
        1,          # total frames
        0,          # scanner
        0           # reserved
    )
    
    # Null header to terminate
    null_header = struct.pack(
        HEADER_FORMAT,
        b'ILDA',
        b'\x00\x00\x00',
        1,
        b'\x00\x00\x00\x00\x00\x00\x00\x00',
        b'\x00\x00\x00\x00\x00\x00\x00\x00',
        0,          # 0 points indicates EOF
        0,
        0,
        0,
        0
    )
    
    with open('test_input.ild', 'wb') as f:
        f.write(header)
        for x, y, status, color in points:
            f.write(struct.pack('>hhBB', x, y, status, color))
        f.write(null_header)
        
    print("Created test_input.ild with 4 points.")

if __name__ == '__main__':
    main()
