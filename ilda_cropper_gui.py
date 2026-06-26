#!/usr/bin/env python3
import os
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from crop_ilda import process_ilda

class IldaCropperGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("ILDA Vertical Band Cropper & Squasher")
        self.root.geometry("650x620")
        self.root.minsize(550, 520)
        
        self.input_files = []
        self.output_directory = None
        
        self.setup_styles()
        self.create_widgets()
        self.update_mode_ui()
        
    def setup_styles(self):
        # Configure a dark/modern theme
        self.root.configure(bg="#2d2d2d")
        self.style = ttk.Style()
        self.style.theme_use('clam')
        
        # Configure styles
        self.style.configure(".", background="#2d2d2d", foreground="#ffffff")
        self.style.configure("TLabel", background="#2d2d2d", foreground="#ffffff", font=("Helvetica", 10))
        self.style.configure("Header.TLabel", background="#2d2d2d", foreground="#00ffcc", font=("Helvetica", 14, "bold"))
        self.style.configure("TButton", background="#4a4a4a", foreground="#ffffff", borderwidth=1, font=("Helvetica", 10))
        self.style.map("TButton", background=[("active", "#626262")])
        self.style.configure("Action.TButton", background="#007acc", foreground="#ffffff", font=("Helvetica", 11, "bold"))
        self.style.map("Action.TButton", background=[("active", "#0098ff")])
        
    def create_widgets(self):
        # Main Layout container
        main_frame = ttk.Frame(self.root, padding=20)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Header
        header = ttk.Label(main_frame, text="ILDA Crowd Safety Cropper", style="Header.TLabel")
        header.pack(anchor=tk.W, pady=(0, 15))
        
        # File selector frame
        file_frame = ttk.LabelFrame(main_frame, text=" File List ", padding=10)
        file_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 15))
        
        list_container = ttk.Frame(file_frame)
        list_container.pack(fill=tk.BOTH, expand=True)
        
        self.scrollbar = ttk.Scrollbar(list_container, orient=tk.VERTICAL)
        self.file_listbox = tk.Listbox(
            list_container, 
            bg="#1e1e1e", 
            fg="#ffffff", 
            selectbackground="#007acc", 
            selectforeground="#ffffff",
            highlightthickness=0,
            yscrollcommand=self.scrollbar.set,
            font=("Courier", 9)
        )
        self.scrollbar.config(command=self.file_listbox.yview)
        
        self.file_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # File buttons
        btn_frame = ttk.Frame(file_frame)
        btn_frame.pack(fill=tk.X, pady=(10, 0))
        
        self.add_btn = ttk.Button(btn_frame, text="Add ILDA Files", command=self.add_files)
        self.add_btn.pack(side=tk.LEFT, padx=(0, 10))
        
        self.remove_btn = ttk.Button(btn_frame, text="Remove Selected", command=self.remove_files)
        self.remove_btn.pack(side=tk.LEFT, padx=10)
        
        self.clear_btn = ttk.Button(btn_frame, text="Clear All", command=self.clear_files)
        self.clear_btn.pack(side=tk.LEFT, padx=10)
        
        # Settings frame
        settings_frame = ttk.LabelFrame(main_frame, text=" Cropping & Scaling Settings ", padding=10)
        settings_frame.pack(fill=tk.X, pady=(0, 15))
        
        # Mode Selection
        mode_label = ttk.Label(settings_frame, text="Processing Mode:")
        mode_label.grid(row=0, column=0, sticky=tk.W, pady=5, padx=(0, 10))
        
        self.mode_var = tk.StringVar(value="discard")
        
        self.r_discard = ttk.Radiobutton(
            settings_frame, 
            text="Discard out-of-bounds points", 
            value="discard", 
            variable=self.mode_var,
            command=self.update_mode_ui
        )
        self.r_discard.grid(row=0, column=1, sticky=tk.W, pady=5)
        
        self.r_squash = ttk.Radiobutton(
            settings_frame,
            text="Squash (scale vertically to fit)",
            value="squash",
            variable=self.mode_var,
            command=self.update_mode_ui
        )
        self.r_squash.grid(row=0, column=2, sticky=tk.W, pady=5, padx=15)

        self.r_time = ttk.Radiobutton(
            settings_frame,
            text="Set duration only (no cropping)",
            value="time",
            variable=self.mode_var,
            command=self.update_mode_ui
        )
        self.r_time.grid(row=0, column=3, sticky=tk.W, pady=5, padx=15)
        
        # Ymin
        ymin_label = ttk.Label(settings_frame, text="Min Y (0 is middle):")
        ymin_label.grid(row=1, column=0, sticky=tk.W, pady=5, padx=(0, 10))
        
        self.ymin_var = tk.IntVar(value=0)
        self.ymin_entry = ttk.Entry(settings_frame, textvariable=self.ymin_var, width=10)
        self.ymin_entry.grid(row=1, column=1, sticky=tk.W, pady=5)
        
        self.ymin_scale = ttk.Scale(settings_frame, from_=-32768, to=32767, variable=self.ymin_var, orient=tk.HORIZONTAL, length=200)
        self.ymin_scale.grid(row=1, column=2, sticky=tk.W, pady=5, padx=15)
        
        # Ymax
        ymax_label = ttk.Label(settings_frame, text="Max Y (safety ceiling):")
        ymax_label.grid(row=2, column=0, sticky=tk.W, pady=5, padx=(0, 10))
        
        self.ymax_var = tk.IntVar(value=15000)
        self.ymax_entry = ttk.Entry(settings_frame, textvariable=self.ymax_var, width=10)
        self.ymax_entry.grid(row=2, column=1, sticky=tk.W, pady=5)
        
        self.ymax_scale = ttk.Scale(settings_frame, from_=-32768, to=32767, variable=self.ymax_var, orient=tk.HORIZONTAL, length=200)
        self.ymax_scale.grid(row=2, column=2, sticky=tk.W, pady=5, padx=15)
        
        # Empty frame strategy (only applies to discard mode)
        self.use_dummy_var = tk.BooleanVar(value=True)
        self.dummy_chk = ttk.Checkbutton(
            settings_frame,
            text="Preserve animation timing (insert blanked point for empty frames)",
            variable=self.use_dummy_var
        )
        self.dummy_chk.grid(row=3, column=0, columnspan=3, sticky=tk.W, pady=(10, 2))

        self.blank_gaps_var = tk.BooleanVar(value=True)
        self.blank_gaps_chk = ttk.Checkbutton(
            settings_frame,
            text="Blank gaps (don't draw a line across removed points)",
            variable=self.blank_gaps_var
        )
        self.blank_gaps_chk.grid(row=4, column=0, columnspan=3, sticky=tk.W, pady=(2, 10))
        
        # Playback duration frame
        dur_frame = ttk.LabelFrame(main_frame, text=" Playback Duration ", padding=10)
        dur_frame.pack(fill=tk.X, pady=(0, 15))

        self.duration_var = tk.BooleanVar(value=False)
        self.dur_chk = ttk.Checkbutton(
            dur_frame,
            text="Set every file to run for:",
            variable=self.duration_var,
            command=self.update_mode_ui
        )
        self.dur_chk.grid(row=0, column=0, sticky=tk.W, pady=5)

        self.seconds_var = tk.DoubleVar(value=10.0)
        self.seconds_entry = ttk.Entry(dur_frame, textvariable=self.seconds_var, width=8)
        self.seconds_entry.grid(row=0, column=1, sticky=tk.W, pady=5, padx=(10, 4))
        ttk.Label(dur_frame, text="seconds").grid(row=0, column=2, sticky=tk.W, pady=5)

        ttk.Label(dur_frame, text="Scan rate (kpps, match your .prg):").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.scan_rate_var = tk.DoubleVar(value=30.0)
        self.scan_rate_entry = ttk.Entry(dur_frame, textvariable=self.scan_rate_var, width=8)
        self.scan_rate_entry.grid(row=1, column=1, sticky=tk.W, pady=5, padx=(10, 4))

        # Direction: lengthen short files, trim long files, or both
        self.extend_dir_var = tk.BooleanVar(value=True)
        self.trim_dir_var = tk.BooleanVar(value=True)
        self.extend_chk = ttk.Checkbutton(
            dur_frame, text="Lengthen files shorter than the target",
            variable=self.extend_dir_var, command=self.update_mode_ui)
        self.extend_chk.grid(row=2, column=0, columnspan=3, sticky=tk.W, pady=(8, 2))
        self.trim_chk = ttk.Checkbutton(
            dur_frame, text="Trim files longer than the target",
            variable=self.trim_dir_var, command=self.update_mode_ui)
        self.trim_chk.grid(row=3, column=0, columnspan=3, sticky=tk.W, pady=2)

        # Output directory options
        out_frame = ttk.LabelFrame(main_frame, text=" Output Location ", padding=10)
        out_frame.pack(fill=tk.X, pady=(0, 15))
        
        self.out_type_var = tk.StringVar(value="same")
        
        self.r_same = ttk.Radiobutton(
            out_frame, 
            text="Save in same folder as input files (appends '_processed')", 
            value="same", 
            variable=self.out_type_var,
            command=self.update_out_ui
        )
        self.r_same.pack(anchor=tk.W, pady=2)
        
        dir_select_container = ttk.Frame(out_frame)
        dir_select_container.pack(fill=tk.X, anchor=tk.W, pady=2)
        
        self.r_custom = ttk.Radiobutton(
            dir_select_container, 
            text="Custom Folder:", 
            value="custom", 
            variable=self.out_type_var,
            command=self.update_out_ui
        )
        self.r_custom.pack(side=tk.LEFT)
        
        self.out_dir_lbl = ttk.Label(dir_select_container, text="No folder selected", font=("Helvetica", 9, "italic"))
        self.out_dir_lbl.pack(side=tk.LEFT, padx=10)
        
        self.out_dir_btn = ttk.Button(dir_select_container, text="Choose...", command=self.choose_output_dir, state=tk.DISABLED)
        self.out_dir_btn.pack(side=tk.LEFT)
        
        # Action button and progress info
        action_container = ttk.Frame(main_frame)
        action_container.pack(fill=tk.X, side=tk.BOTTOM, pady=10)
        
        self.process_btn = ttk.Button(action_container, text="PROCESS FILES", style="Action.TButton", command=self.run_processing)
        self.process_btn.pack(side=tk.RIGHT)
        
        self.status_lbl = ttk.Label(action_container, text="", font=("Helvetica", 10))
        self.status_lbl.pack(side=tk.LEFT)
        
    def add_files(self):
        files = filedialog.askopenfilenames(
            title="Select ILDA files", 
            filetypes=[("ILDA Laser Files", "*.ild"), ("All Files", "*.*")]
        )
        if files:
            for file in files:
                if file not in self.input_files:
                    self.input_files.append(file)
                    self.file_listbox.insert(tk.END, os.path.basename(file))
                    
    def remove_files(self):
        selected_indices = self.file_listbox.curselection()
        for idx in reversed(selected_indices):
            self.file_listbox.delete(idx)
            del self.input_files[idx]
            
    def clear_files(self):
        self.file_listbox.delete(0, tk.END)
        self.input_files.clear()
        
    def choose_output_dir(self):
        directory = filedialog.askdirectory(title="Choose output directory")
        if directory:
            self.output_directory = directory
            self.out_dir_lbl.config(text=os.path.basename(directory))
            
    def update_out_ui(self):
        if self.out_type_var.get() == "custom":
            self.out_dir_btn.config(state=tk.NORMAL)
        else:
            self.out_dir_btn.config(state=tk.DISABLED)
            
    def update_mode_ui(self):
        mode = self.mode_var.get()
        is_time = (mode == "time")

        # Cropping controls are irrelevant in duration-only mode
        crop_state = tk.DISABLED if is_time else tk.NORMAL
        for w in (self.ymin_entry, self.ymax_entry, self.ymin_scale, self.ymax_scale):
            w.config(state=crop_state)

        # Empty-frame dummy and gap-blanking only apply to discard mode
        discard_state = tk.NORMAL if mode == "discard" else tk.DISABLED
        self.dummy_chk.config(state=discard_state)
        self.blank_gaps_chk.config(state=discard_state)

        # Duration is forced on (and locked) in time mode, otherwise optional via the checkbox
        if is_time:
            self.duration_var.set(True)
            self.dur_chk.config(state=tk.DISABLED)
        else:
            self.dur_chk.config(state=tk.NORMAL)

        dur_active = self.duration_var.get() or is_time
        dur_state = tk.NORMAL if dur_active else tk.DISABLED
        self.seconds_entry.config(state=dur_state)
        self.scan_rate_entry.config(state=dur_state)
        self.extend_chk.config(state=dur_state)
        self.trim_chk.config(state=dur_state)
            
    def run_processing(self):
        if not self.input_files:
            messagebox.showwarning("No Files", "Please add at least one ILDA file to process.")
            return
            
        ymin = self.ymin_var.get()
        ymax = self.ymax_var.get()
        mode = self.mode_var.get()

        if mode != "time" and ymin > ymax:
            messagebox.showerror("Invalid Range", "Minimum Y value cannot be greater than Maximum Y value.")
            return

        # Duration settings (forced on in time mode, optional otherwise)
        use_duration = self.duration_var.get() or mode == "time"
        extend_seconds = None
        scan_rate_kpps = 30.0
        allow_extend = True
        allow_trim = True
        if use_duration:
            try:
                extend_seconds = float(self.seconds_var.get())
                scan_rate_kpps = float(self.scan_rate_var.get())
            except (tk.TclError, ValueError):
                messagebox.showerror("Invalid Duration", "Target seconds and scan rate must be numbers.")
                return
            if extend_seconds <= 0 or scan_rate_kpps <= 0:
                messagebox.showerror("Invalid Duration", "Target seconds and scan rate must be greater than zero.")
                return
            allow_extend = self.extend_dir_var.get()
            allow_trim = self.trim_dir_var.get()
            if not (allow_extend or allow_trim):
                messagebox.showerror("Invalid Duration",
                                     "Select at least one of 'Lengthen' or 'Trim' for the duration.")
                return

        use_dummy = self.use_dummy_var.get()
        blank_gaps = self.blank_gaps_var.get()
        out_type = self.out_type_var.get()
        
        if out_type == "custom" and not self.output_directory:
            messagebox.showwarning("No Output Folder", "Please select a custom output directory.")
            return
            
        success_count = 0
        
        for file in self.input_files:
            # Determine output filename
            if out_type == "same":
                base, ext = os.path.splitext(file)
                outfile = f"{base}_processed{ext}"
            else:
                filename = os.path.basename(file)
                outfile = os.path.join(self.output_directory, filename)
                
            try:
                self.status_lbl.config(text=f"Processing: {os.path.basename(file)}...")
                self.root.update()
                
                process_ilda(file, outfile, ymin, ymax, use_dummy, mode,
                             target_seconds=extend_seconds, scan_rate_kpps=scan_rate_kpps,
                             allow_extend=allow_extend, allow_trim=allow_trim, blank_gaps=blank_gaps)
                success_count += 1
            except Exception as e:
                messagebox.showerror("Error Processing File", f"Could not process {os.path.basename(file)}:\n{str(e)}")
                
        self.status_lbl.config(text="Processing complete!")
        messagebox.showinfo("Success", f"Successfully processed {success_count} of {len(self.input_files)} files!")

def main():
    root = tk.Tk()
    app = IldaCropperGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()
