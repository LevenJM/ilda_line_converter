# ILDA Studio & Safety Cropper

A batch processing tool, desktop application, and web application for restricting the vertical (Y) coordinate range of ILDA (`.ild`) laser show files and normalizing playback durations.

This utility keeps projections strictly within a designated horizontal band (for example, above audience heads for crowd safety) by either **cropping** coordinates outside the bounds or **squashing** (scaling) the entire projection vertically to fit.

🌐 **Live Web Application:** [https://levenjm.github.io/ilda_line_converter/](https://levenjm.github.io/ilda_line_converter/)

---

## Features

- **Web Application (React + Vite):** Hosted on GitHub Pages, featuring interactive live side-by-side vector visualization, playback controls, and client-side batch processing with ZIP export.
- **Desktop GUI (Python + Tkinter):** Native offline interface with folder creation, file list management, and preset controls.
- **CLI Utility (`crop_ilda.py`):** Scriptable for automated workflows or pipelines.
- **Three Processing Modes:**
  - **Discard (Crop):** Drops points that fall outside the target vertical band. Automatically recalculates end-of-frame flags and inserts blanked travel points across removed gaps to prevent beam travel lines.
  - **Squash (Scale):** Analyzes the file's global vertical bounds and scales all Y coordinates proportionally to fit exactly inside your safety band.
  - **Set Duration (Time Only):** Leaves geometry untouched and repeats or trims frames so the file plays for a target duration at a given scanner scan rate (kpps).
- **Target Playback Duration Normalization:** Repeats or trims frames to match a specific duration in seconds based on scan rate (kpps). Includes direction controls (Lengthen, Trim, or Both).
- **ILDA Standard Compliance:** Full support for Format 0 (3D indexed), Format 1 (2D indexed), Format 4 (3D True Color RGB), and Format 5 (2D True Color RGB).

---

## Interfaces

### 1. Web Studio (Zero Installation)

Open **[https://levenjm.github.io/ilda_line_converter/](https://levenjm.github.io/ilda_line_converter/)** in any modern web browser.

- Drag and drop `.ild` files.
- Inspect frames with the live vector canvas and before/after split view.
- Tweak Y Min/Max thresholds or choose presets.
- Export individual processed files or download a batch `.zip`.

To run the web app locally:
```bash
cd web
npm install
npm run dev
```

---

### 2. Desktop GUI

Requires Python 3 (with Tkinter):

```bash
./ilda_cropper_gui.py
```

- Add files or folders.
- Choose Discard or Squash mode.
- Set output destination or auto-create a new output folder.
- Process batch files directly on your local filesystem.

---

### 3. Command Line Interface

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
| `--mode` | Processing mode: `discard`, `squash`, or `time` | `discard` |
| `--discard-empty-frames` | Skip empty frames instead of writing a blanked dummy point | `False` |
| `--no-blank-gaps` | Do not insert blanked travel points across gaps | `False` |
| `--seconds` | Target playback duration in seconds | `None` |
| `--scan-rate-kpps` | Scan rate (kpps) used to estimate duration | `30` |
| `--resize` | Direction: `extend`, `trim`, or `both` | `both` |

---

## Coordinate Reference

ILDA coordinates use signed 16-bit integers:
- `+32767` -> Top of scanner window
- `0` -> Vertical Center
- `-32768` -> Bottom of scanner window

For crowd safety lines, mapping a band like `0` (center) to `15000` keeps laser beams above audience height.

---

## Safety Disclaimer

> [!WARNING]
> While this tool alters the coordinates of your ILDA files, **always test your show files with the laser output disabled or at a safe test orientation** first. Software modifications cannot compensate for incorrect physical projector alignment, hardware failures, or scanner drift. Always verify safety zoning configuration on your laser DAC or projector hardware.
