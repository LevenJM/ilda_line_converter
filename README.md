# ILDA Line Converter & Safety Cropper

A batch processing tool and graphical interface for restricting the vertical (Y) coordinate range of ILDA (`.ild`) laser show files. 

This utility helps keep projections strictly within a designated horizontal band (for example, above the audience's heads for crowd safety) by either **discarding** coordinates outside the bounds or **squashing** (scaling) the entire projection vertically to fit.

---

## Features

- **Batch Processing:** Load and process multiple ILDA files simultaneously.
- **Two Processing Modes:**
  - **Discard:** Drops any points that fall outside the target vertical band. Re-calculates end-of-frame flags dynamically.
  - **Squash:** Scans the file to find global vertical limits and scales all coordinates proportionally to fit exactly inside your safety band.
- **Animation Timing Protection:** In *Discard* mode, if a frame ends up empty, a single blanked (laser-off) dummy point is inserted to keep the animation frames synced and prevent playback speed issues.
- **ILDA Standard Compliance:** Parses and outputs Format 0 (3D indexed), Format 1 (2D indexed), Format 4 (3D True Color/RGB), and Format 5 (2D True Color/RGB).
- **Modern Desktop GUI:** Built with Python's native Tkinter, featuring a clean dark-mode interface and simple sliders.

---

## Requirements

- **Python 3.x**
- **Tkinter** (usually comes pre-installed with Python. On Linux systems like Ubuntu/Debian, if missing, install it via: `sudo apt-get install python3-tk`)

---

## Installation

No external library dependencies are required. Clone or copy the folder contents to your local system and ensure the scripts have execute permissions:

```bash
chmod +x crop_ilda.py ilda_cropper_gui.py
```

---

## Usage

### 1. Graphical Interface (Recommended)

To open the user-friendly desktop application:

```bash
./ilda_cropper_gui.py
```

- **Add Files:** Click "Add ILDA Files" to load multiple files into the listbox.
- **Settings:** 
  - Choose between **Discard** or **Squash** mode.
  - Adjust the **Min Y** and **Max Y** boundaries (ILDA range is `-32768` (bottom) to `32767` (top), where `0` is the center).
- **Output:** Choose to save output files in the same folder (appends `_processed`) or select a custom output folder.
- **Process:** Click **Process Files** to execute.

---

### 2. Command Line Interface

You can run the script programmatically or write automated scripts.

```bash
./crop_ilda.py -i input.ild -o output.ild --ymin 0 --ymax 15000 --mode squash
```

#### CLI Options:

| Argument | Description | Default |
| :--- | :--- | :--- |
| `-i`, `--input` | Path to the source `.ild` file | *Required* |
| `-o`, `--output` | Path to save the processed `.ild` file | *Required* |
| `--ymin` | Lower Y coordinate boundary | `0` |
| `--ymax` | Upper Y coordinate boundary | `15000` |
| `--mode` | Processing mode: `discard` or `squash` | `discard` |
| `--discard-empty-frames` | Skip empty frames completely instead of writing a blanked dummy point (Discard mode only) | `False` |

---

## Coordinate Reference

ILDA coordinates use signed 16-bit integers:
- `32767` -> Top of scanner window
- `0` -> Vertical Center
- `-32768` -> Bottom of scanner window

For crowd safety lines, mapping a band like `0` (center) to `15000` (about halfway up the top half of the projection area) keeps the beam high and level above head height.

---

## Safety Disclaimer

> [!WARNING]
> While this tool alters the coordinates of your ILDA files, **always test your show files with the laser output disabled or at a safe test orientation** first. Software modifications cannot compensate for incorrect physical projector alignment, hardware failures, or scanner drift. Always verify safety zoning configuration on your laser DAC or projector.
