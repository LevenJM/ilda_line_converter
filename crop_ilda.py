#!/usr/bin/env python3
import struct
import sys
import argparse

HEADER_FORMAT = '>4s3sB8s8sHHHBB'
HEADER_SIZE = struct.calcsize(HEADER_FORMAT)

def get_global_y_bounds(file_bytes):
    """Scan the entire ILDA file to find the minimum and maximum Y coordinates."""
    offset = 0
    file_len = len(file_bytes)
    ymin = None
    ymax = None
    
    while offset < file_len:
        if offset + HEADER_SIZE > file_len:
            break
        
        header_data = file_bytes[offset:offset+HEADER_SIZE]
        sig, reserved, format_code, name, company, point_count, frame_num, total_frames, scanner, reserved2 = struct.unpack(HEADER_FORMAT, header_data)
        
        if sig != b'ILDA':
            break
            
        offset += HEADER_SIZE
        
        if format_code == 0:
            point_size = 8
        elif format_code == 1:
            point_size = 6
        elif format_code == 2:
            point_size = 3
        elif format_code == 4:
            point_size = 10
        elif format_code == 5:
            point_size = 8
        else:
            break
            
        data_size = point_count * point_size
        if offset + data_size > file_len:
            break
            
        raw_data = file_bytes[offset:offset+data_size]
        offset += data_size
        
        if format_code in (0, 1, 4, 5) and point_count > 0:
            for i in range(point_count):
                pt_bytes = raw_data[i*point_size : (i+1)*point_size]
                if format_code in (0, 4):
                    _, y, _ = struct.unpack('>hhh', pt_bytes[0:6])
                else:
                    _, y = struct.unpack('>hh', pt_bytes[0:4])
                
                if ymin is None or y < ymin:
                    ymin = y
                if ymax is None or y > ymax:
                    ymax = y
                    
    return ymin, ymax

def set_duration_out_frames(out_frames, target_seconds, scan_rate_kpps,
                            allow_extend=True, allow_trim=True):
    """Repeat OR trim the animation frames so the file plays for ~target_seconds.

    Playback time is estimated as points / scan_rate. Frames are accumulated by
    looping over the sequence until the cumulative time is as close as possible to
    the target: files shorter than the target are repeated, files longer than it are
    trimmed at the nearest frame boundary. Every kept frame's frame_num/total_frames
    header fields are then renumbered so the player honors the new length.

    Direction is gated relative to one full pass:
      - allow_extend=False leaves files shorter than the target untouched.
      - allow_trim=False   leaves files longer than the target untouched.

    Header tuple layout: (sig, reserved, format_code, name, company,
                          point_count[5], frame_num[6], total_frames[7], scanner, reserved2)
    Returns (new_out_frames, base_seconds, est_seconds, orig_frames, new_frames_count).
    """
    PC, FN, TF, FMT = 5, 6, 7, 2
    reals      = [fr for fr in out_frames if fr['header'][PC] > 0 and fr['header'][FMT] != 2]
    palettes   = [fr for fr in out_frames if fr['header'][FMT] == 2]
    terminator = next((fr for fr in out_frames if fr['header'][PC] == 0), None)

    if not reals:
        return out_frames, 0.0, 0.0, 0, 0

    pps = max(1.0, scan_rate_kpps * 1000.0)
    frame_pts = [fr['header'][PC] for fr in reals]
    base_points = sum(frame_pts)
    base_seconds = base_points / pps
    target_points = max(0.0, target_seconds * pps)
    F = len(reals)
    FRAME_LIMIT = 65535  # frame_num / total_frames are unsigned 16-bit

    # Respect the chosen direction: skip files that would need a disallowed change.
    if (target_points > base_points and not allow_extend) or \
       (target_points < base_points and not allow_trim):
        return out_frames, base_seconds, base_seconds, F, F

    # Walk the sequence (looping as needed), keeping frames while doing so moves us
    # closer to the target. Stopping early trims long files; looping extends short
    # ones. At least one frame is always kept.
    selected = []
    cum = 0
    i = 0
    while len(selected) < FRAME_LIMIT:
        p = frame_pts[i % F]
        if selected and abs(cum + p - target_points) >= abs(cum - target_points):
            break
        selected.append(i % F)
        cum += p
        i += 1

    if len(selected) >= FRAME_LIMIT:
        print(f"  Warning: target needs more than {FRAME_LIMIT} frames; clamping.", file=sys.stderr)

    M = len(selected)
    new_frames = list(palettes)
    for idx, ri in enumerate(selected):
        h = list(reals[ri]['header'])
        h[FN] = idx
        h[TF] = M
        new_frames.append({'header': tuple(h), 'points_data': reals[ri]['points_data']})
    if terminator is not None:
        h = list(terminator['header'])
        h[FN] = 0
        h[TF] = M
        new_frames.append({'header': tuple(h), 'points_data': terminator['points_data']})

    return new_frames, base_seconds, cum / pps, F, M

def process_ilda(input_path, output_path, y_min, y_max, use_dummy, mode="discard",
                 target_seconds=None, scan_rate_kpps=30.0, allow_extend=True, allow_trim=True,
                 blank_gaps=True):
    try:
        with open(input_path, 'rb') as f:
            file_bytes = f.read()
    except Exception as e:
        print(f"Error reading input file: {e}", file=sys.stderr)
        sys.exit(1)
    
    offset = 0
    file_len = len(file_bytes)
    
    # In squash mode, find the global Y bounds first
    glob_ymin, glob_ymax = None, None
    if mode == "squash":
        glob_ymin, glob_ymax = get_global_y_bounds(file_bytes)
        if glob_ymin is None or glob_ymax is None:
            # No points found or invalid file, fallback to normal processing
            print("Warning: squash mode could not determine Y bounds (no points found); "
                  "falling back to discard mode.", file=sys.stderr)
            mode = "discard"
        else:
            print(f"Global Y bounds for squashing: {glob_ymin} to {glob_ymax}")
            
    out_frames = []
    skipped_frames_count = 0
    total_original_points = 0
    total_kept_points = 0
    
    while offset < file_len:
        if offset + HEADER_SIZE > file_len:
            break
        
        # Parse header
        header_data = file_bytes[offset:offset+HEADER_SIZE]
        sig, reserved, format_code, name, company, point_count, frame_num, total_frames, scanner, reserved2 = struct.unpack(HEADER_FORMAT, header_data)
        
        if sig != b'ILDA':
            print(f"Warning: Invalid header signature {sig} at offset {offset}. Stopping.", file=sys.stderr)
            break
            
        offset += HEADER_SIZE
        
        # Determine point record size based on format_code
        if format_code == 0:
            point_size = 8
        elif format_code == 1:
            point_size = 6
        elif format_code == 2:
            point_size = 3
        elif format_code == 4:
            point_size = 10
        elif format_code == 5:
            point_size = 8
        else:
            print(f"Error: Unknown format code {format_code} at offset {offset - HEADER_SIZE}", file=sys.stderr)
            sys.exit(1)
            
        data_size = point_count * point_size
        if offset + data_size > file_len:
            print(f"Error: Unexpected EOF while reading data section for format {format_code}", file=sys.stderr)
            sys.exit(1)
            
        raw_data = file_bytes[offset:offset+data_size]
        offset += data_size
        
        # If it is a palette frame (Format 2) or if it's the null header (point_count == 0)
        if format_code == 2 or point_count == 0:
            out_frames.append({
                'header': (sig, reserved, format_code, name, company, point_count, frame_num, total_frames, scanner, reserved2),
                'points_data': raw_data
            })
            continue
            
        total_original_points += point_count
        
        # Process points
        processed_points = []
        gap_since_last_kept = False  # discard mode: did we drop point(s) since the last kept one?
        for i in range(point_count):
            pt_bytes = raw_data[i*point_size : (i+1)*point_size]
            
            # Extract coordinates
            if format_code in (0, 4):
                # 3D
                x, y, z = struct.unpack('>hhh', pt_bytes[0:6])
            else:
                # 2D
                x, y = struct.unpack('>hh', pt_bytes[0:4])
                
            if mode == "squash":
                # Squash/Scale Y coordinate into [y_min, y_max]
                if glob_ymax > glob_ymin:
                    scale = (y_max - y_min) / (glob_ymax - glob_ymin)
                    new_y = int(round(y_min + (y - glob_ymin) * scale))
                else:
                    new_y = int((y_min + y_max) / 2)
                
                # Re-pack coordinates into point bytes
                if format_code in (0, 4):
                    new_pt_coords = struct.pack('>hhh', x, new_y, z)
                else:
                    new_pt_coords = struct.pack('>hh', x, new_y)
                
                # Combine new coordinates with remaining attributes (status/color)
                pt_bytes = new_pt_coords + pt_bytes[len(new_pt_coords):]
                processed_points.append(pt_bytes)
                
            elif mode == "time":
                # Duration-only mode: keep every point unchanged (no geometry change)
                processed_points.append(pt_bytes)

            else:  # discard mode
                if y_min <= y <= y_max:
                    # If we just dropped points, insert a blanked travel point so the
                    # laser moves DARK across the removed span instead of drawing a
                    # straight line connecting the two surviving endpoints.
                    if blank_gaps and gap_since_last_kept and processed_points:
                        sidx = 6 if format_code in (0, 4) else 4
                        blanked = pt_bytes[:sidx] + bytes([pt_bytes[sidx] | 0x40]) + pt_bytes[sidx+1:]
                        processed_points.append(blanked)
                    processed_points.append(pt_bytes)
                    gap_since_last_kept = False
                else:
                    gap_since_last_kept = True

        # If no points processed (only possible in discard mode)
        if len(processed_points) == 0:
            if use_dummy:
                # Create a single blanked dummy point
                if format_code == 0:
                    dummy = struct.pack('>hhhBB', 0, 0, 0, 0xC0, 0)
                elif format_code == 1:
                    dummy = struct.pack('>hhBB', 0, 0, 0xC0, 0)
                elif format_code == 4:
                    dummy = struct.pack('>hhhB', 0, 0, 0, 0xC0) + b'\x00\x00\x00'
                elif format_code == 5:
                    dummy = struct.pack('>hhB', 0, 0, 0xC0) + b'\x00\x00\x00'
                processed_points = [dummy]
            else:
                # Skip frame entirely
                skipped_frames_count += 1
                continue
                
        # Modify status bytes to ensure correct last-point bit
        modified_points = []
        for idx, pt in enumerate(processed_points):
            status_idx = 6 if format_code in (0, 4) else 4
            status = pt[status_idx]
            
            if idx == len(processed_points) - 1:
                # Set Bit 7 (Last Point)
                status = status | 0x80
            else:
                # Clear Bit 7
                status = status & 0x7F
                
            new_pt = pt[:status_idx] + bytes([status]) + pt[status_idx+1:]
            modified_points.append(new_pt)
            
        new_data = b"".join(modified_points)
        new_point_count = len(modified_points)
        total_kept_points += new_point_count
        
        out_frames.append({
            'header': (sig, reserved, format_code, name, company, new_point_count, frame_num, total_frames, scanner, reserved2),
            'points_data': new_data
        })

    # Optionally repeat (or trim) frames so each file plays for ~target_seconds
    if target_seconds and (allow_extend or allow_trim):
        out_frames, base_s, est_s, F, M = set_duration_out_frames(
            out_frames, target_seconds, scan_rate_kpps, allow_extend, allow_trim)
        action = "trimmed" if M < F else ("extended" if M > F else "left as-is")
        print(f"  Duration: one pass ~{base_s:.2f}s @ {scan_rate_kpps}kpps -> {action} "
              f"{F} -> {M} frames for ~{est_s:.1f}s (target {target_seconds}s)")

    # Write output
    try:
        with open(output_path, 'wb') as f:
            for frame in out_frames:
                h = frame['header']
                header_bytes = struct.pack(HEADER_FORMAT, *h)
                f.write(header_bytes)
                f.write(frame['points_data'])
    except Exception as e:
        print(f"Error writing output file: {e}", file=sys.stderr)
        sys.exit(1)
            
    print(f"Successfully processed {input_path} -> {output_path} (mode: {mode})")
    print(f"  Total frames output: {len(out_frames)} (skipped {skipped_frames_count} empty frames)")
    print(f"  Total points: original {total_original_points} -> kept/modified {total_kept_points}")

def main():
    parser = argparse.ArgumentParser(description="Crop or squash ILDA files into a configurable vertical band.")
    parser.add_argument("-i", "--input", required=True, help="Path to the input .ild file")
    parser.add_argument("-o", "--output", required=True, help="Path to the output .ild file")
    parser.add_argument("--ymin", type=int, default=0, help="Minimum Y coordinate (default: 0, which is middle)")
    parser.add_argument("--ymax", type=int, default=15000, help="Maximum Y coordinate (default: 15000, standard ILDA max is 32767)")
    parser.add_argument("--mode", choices=["discard", "squash", "time"], default="discard",
                        help="Processing mode: 'discard' deletes points outside the band, "
                             "'squash' scales all Y coordinates to fit inside it, "
                             "'time' leaves geometry untouched and only adjusts playback duration.")
    parser.add_argument("--discard-empty-frames", action="store_true",
                        help="Discard frames that contain no points in the vertical band instead of writing a single blanked dummy point (only applicable to discard mode).")
    parser.add_argument("--seconds", type=float, default=None, dest="seconds",
                        help="Target playback duration in seconds. Repeats each file's frames to run for "
                             "approximately this long. Required for --mode time; optional for discard/squash.")
    parser.add_argument("--scan-rate-kpps", type=float, default=30.0,
                        help="Scan rate in kpps used to estimate playback time for --seconds. "
                             "Set this to match the scan rate in your .prg file (default: 30).")
    parser.add_argument("--resize", choices=["both", "extend", "trim"], default="both",
                        help="Direction for --seconds: 'extend' only lengthens shorter files, "
                             "'trim' only shortens longer files, 'both' does either (default: both).")
    parser.add_argument("--no-blank-gaps", action="store_true",
                        help="Discard mode: do NOT insert a blanked travel point where points were "
                             "removed. By default a blanked point is inserted so the laser moves dark "
                             "across the gap instead of drawing a connecting line.")

    args = parser.parse_args()

    allow_extend = args.resize in ("both", "extend")
    allow_trim = args.resize in ("both", "trim")

    if args.mode != "time" and args.ymin > args.ymax:
        print("Error: --ymin cannot be greater than --ymax", file=sys.stderr)
        sys.exit(1)

    if args.mode == "time" and args.seconds is None:
        print("Error: --mode time requires --seconds (the target duration).", file=sys.stderr)
        sys.exit(1)

    process_ilda(args.input, args.output, args.ymin, args.ymax, not args.discard_empty_frames,
                 args.mode, target_seconds=args.seconds, scan_rate_kpps=args.scan_rate_kpps,
                 allow_extend=allow_extend, allow_trim=allow_trim, blank_gaps=not args.no_blank_gaps)

if __name__ == "__main__":
    main()
