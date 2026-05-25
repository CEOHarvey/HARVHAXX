import tkinter as tk
from tkinter import ttk

# Cyber / industrial theme (electric blue + red accents)
BG = "#080a0e"
SURFACE = "#0e1118"
CARD = "#12161f"
INPUT_BG = "#1a2030"
BORDER = "#2a3548"
ACCENT = "#00c8f0"
ACCENT_HOVER = "#5ce8ff"
ACCENT_SOFT = "#0099bb"
ACCENT_GLOW = "#003d52"
RED = "#e41e2a"
RED_HOVER = "#ff3d48"
RED_SOFT = "#b81822"
TEXT = "#dce8f4"
MUTED = "#6a7a90"
SUCCESS = "#3ddc84"
DANGER = RED
FONT = "Segoe UI"
APP_NAME = "Harvcious Hacks"
TAGLINE = "SYSTEM OVERRIDE"


def style_root(root: tk.Tk) -> ttk.Style:
    root.configure(bg=BG)
    style = ttk.Style()
    style.theme_use("clam")
    style.configure("App.TFrame", background=BG)
    style.configure("Card.TFrame", background=CARD)
    style.configure(
        "TProgressbar",
        thickness=2,
        background=ACCENT,
        troughcolor=INPUT_BG,
        borderwidth=0,
    )
    return style


def make_shell(parent: tk.Misc, root: tk.Misc | None = None):
    """Returns (content_frame, animated_brand_title or None)."""
    from loader.ui_brand_title import AnimatedBrandTitle

    card = tk.Frame(parent, bg=CARD)
    card.pack(fill=tk.BOTH, expand=True)
    animated_title = None

    if root is not None:
        hdr = tk.Frame(card, bg=CARD)
        hdr.pack(fill=tk.X, padx=4, pady=(6, 2))
        animated_title = AnimatedBrandTitle(hdr, root)
        animated_title.frame.pack(fill=tk.X)
        animated_title.start()

    strip = tk.Frame(card, bg=ACCENT, height=2)
    strip.pack(fill=tk.X)
    strip.pack_propagate(False)

    content = tk.Frame(card, bg=CARD)
    content.pack(fill=tk.BOTH, expand=True)
    return content, animated_title


def brand_header(parent: tk.Misc, subtitle: str = "") -> tk.Frame:
    box = tk.Frame(parent, bg=CARD)
    box.pack(fill=tk.X, pady=(0, 6))

    if subtitle:
        tk.Label(
            box,
            text=subtitle,
            bg=CARD,
            fg=MUTED,
            font=(FONT, 8),
        ).pack(anchor=tk.CENTER, pady=(4, 0))
    return box


def field_label(parent: tk.Misc, text: str) -> tk.Label:
    return tk.Label(
        parent,
        text=text,
        bg=CARD,
        fg=MUTED,
        font=(FONT, 8),
        anchor=tk.W,
    )


def make_entry(parent: tk.Misc, show: str | None = None) -> tk.Entry:
    entry = tk.Entry(
        parent,
        show=show,
        bg=INPUT_BG,
        fg=TEXT,
        insertbackground=ACCENT,
        relief=tk.FLAT,
        font=(FONT, 10),
        highlightthickness=1,
        highlightbackground=BORDER,
        highlightcolor=ACCENT,
    )
    entry.pack(fill=tk.X, pady=(1, 8), ipady=5)
    return entry


def make_message(parent: tk.Misc, bg: str = CARD) -> tk.Label:
    lbl = tk.Label(
        parent,
        text="",
        bg=bg,
        fg=DANGER,
        font=(FONT, 8),
        wraplength=300,
        justify=tk.CENTER,
        anchor=tk.CENTER,
    )
    lbl.pack(fill=tk.X, pady=(0, 4))
    return lbl


def bind_button_hover(btn: tk.Button, normal: str, hover: str) -> None:
    def on_enter(_e):
        if str(btn["state"]) != "disabled":
            btn["bg"] = hover

    def on_leave(_e):
        btn["bg"] = normal

    btn.bind("<Enter>", on_enter)
    btn.bind("<Leave>", on_leave)


def accent_button(parent: tk.Misc, text: str, command) -> tk.Button:
    btn = tk.Button(
        parent,
        text=text,
        command=command,
        bg=ACCENT,
        fg="#001018",
        activebackground=ACCENT_HOVER,
        activeforeground="#001018",
        font=(FONT, 10, "bold"),
        relief=tk.FLAT,
        cursor="hand2",
        padx=10,
        pady=7,
        borderwidth=0,
    )
    btn.pack(fill=tk.X, pady=(2, 6))
    bind_button_hover(btn, ACCENT, ACCENT_HOVER)
    return btn


def ghost_button(parent: tk.Misc, text: str, command) -> tk.Button:
    btn = tk.Button(
        parent,
        text=text,
        command=command,
        bg=CARD,
        fg=MUTED,
        activebackground=INPUT_BG,
        activeforeground=TEXT,
        font=(FONT, 9),
        relief=tk.FLAT,
        cursor="hand2",
        padx=6,
        pady=4,
    )
    btn.pack(pady=(0, 2))
    bind_button_hover(btn, CARD, INPUT_BG)
    return btn


def hero_button(parent: tk.Misc, text: str, command) -> tk.Button:
    wrap = tk.Frame(parent, bg=CARD)
    wrap.pack(fill=tk.X, pady=(6, 4))
    btn = tk.Button(
        wrap,
        text=text,
        command=command,
        bg=ACCENT,
        fg="#001018",
        activebackground=ACCENT_HOVER,
        font=(FONT, 11, "bold"),
        relief=tk.FLAT,
        cursor="hand2",
        padx=10,
        pady=10,
        borderwidth=0,
    )
    btn.pack(fill=tk.X)
    bind_button_hover(btn, ACCENT, ACCENT_HOVER)
    return btn


def card_panel(parent: tk.Misc, bg: str = INPUT_BG) -> tk.Frame:
    outer = tk.Frame(parent, bg=ACCENT_GLOW, padx=1, pady=1)
    outer.pack(fill=tk.X, pady=(0, 6))
    inner = tk.Frame(outer, bg=bg, padx=10, pady=8)
    inner.pack(fill=tk.X)
    return inner


def bottom_hint(parent: tk.Misc, text: str) -> tk.Label:
    footer = tk.Frame(parent, bg=CARD)
    footer.pack(side=tk.BOTTOM, fill=tk.X, pady=(6, 2))
    line = tk.Frame(footer, bg=RED, height=2)
    line.pack(fill=tk.X, padx=40, pady=(0, 6))
    lbl = tk.Label(
        footer,
        text=text,
        bg=CARD,
        fg=RED_SOFT,
        font=(FONT, 9),
        anchor=tk.CENTER,
        justify=tk.CENTER,
    )
    lbl.pack(anchor=tk.CENTER)
    return lbl


def secondary_button(parent: tk.Misc, text: str, command) -> tk.Button:
    btn = tk.Button(
        parent,
        text=text,
        bg=INPUT_BG,
        fg=TEXT,
        activebackground=BORDER,
        font=(FONT, 9),
        relief=tk.FLAT,
        cursor="hand2",
        padx=8,
        pady=6,
        command=command,
    )
    bind_button_hover(btn, INPUT_BG, BORDER)
    return btn
