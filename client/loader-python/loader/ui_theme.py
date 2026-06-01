import tkinter as tk
from tkinter import ttk

# Modern dark UI — electric cyan + red accents
BG = "#06080c"
SURFACE = "#0c1018"
CARD = "#111620"
INPUT_BG = "#181f2e"
BORDER = "#2b3648"
ACCENT = "#00d4ff"
ACCENT_HOVER = "#66e8ff"
ACCENT_SOFT = "#0a8fb0"
ACCENT_GLOW = "#0a3040"
RED = "#ff2d42"
RED_HOVER = "#ff5c6c"
RED_SOFT = "#c41e30"
TEXT = "#eef4fc"
MUTED = "#8b9bb5"
SUCCESS = "#42e8a0"
DANGER = RED
WARN = "#ffb020"

FONT = "Segoe UI"
FONT_CAPTION = (FONT, 8)
FONT_LABEL = (FONT, 9)
FONT_BODY = (FONT, 10)
FONT_BODY_BOLD = (FONT, 10, "bold")
FONT_SUBTITLE = (FONT, 11)
FONT_TITLE = (FONT, 12, "bold")
FONT_HERO = (FONT, 18, "bold")
FONT_COUNTDOWN = ("Consolas", 15, "bold")
FONT_BUTTON = (FONT, 10, "bold")
FONT_BUTTON_HERO = (FONT, 11, "bold")

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
        thickness=3,
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
        hdr.pack(fill=tk.X, padx=6, pady=(8, 4))
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
    box.pack(fill=tk.X, pady=(0, 8))

    if subtitle:
        tk.Label(
            box,
            text=subtitle.upper(),
            bg=CARD,
            fg=MUTED,
            font=FONT_CAPTION,
        ).pack(anchor=tk.CENTER, pady=(2, 0))
    return box


def section_label(parent: tk.Misc, text: str, bg: str = INPUT_BG) -> tk.Label:
    return tk.Label(
        parent,
        text=text.upper(),
        bg=bg,
        fg=ACCENT_SOFT,
        font=FONT_CAPTION,
        anchor=tk.W,
    )


def field_label(parent: tk.Misc, text: str) -> tk.Label:
    return tk.Label(
        parent,
        text=text,
        bg=CARD,
        fg=MUTED,
        font=FONT_LABEL,
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
        font=FONT_BODY,
        highlightthickness=1,
        highlightbackground=BORDER,
        highlightcolor=ACCENT,
    )
    entry.pack(fill=tk.X, pady=(2, 10), ipady=6)
    return entry


def make_message(parent: tk.Misc, bg: str = CARD) -> tk.Label:
    lbl = tk.Label(
        parent,
        text="",
        bg=bg,
        fg=DANGER,
        font=FONT_LABEL,
        wraplength=320,
        justify=tk.CENTER,
        anchor=tk.CENTER,
    )
    lbl.pack(fill=tk.X, pady=(0, 6))
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
        font=FONT_BUTTON,
        relief=tk.FLAT,
        cursor="hand2",
        padx=12,
        pady=8,
        borderwidth=0,
    )
    btn.pack(fill=tk.X, pady=(4, 8))
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
        font=FONT_LABEL,
        relief=tk.FLAT,
        cursor="hand2",
        padx=8,
        pady=5,
    )
    btn.pack(pady=(0, 4))
    bind_button_hover(btn, CARD, INPUT_BG)
    return btn


def hero_button(parent: tk.Misc, text: str, command) -> tk.Button:
    wrap = tk.Frame(parent, bg=CARD)
    wrap.pack(fill=tk.X, pady=(8, 6))
    btn = tk.Button(
        wrap,
        text=text,
        command=command,
        bg=ACCENT,
        fg="#001018",
        activebackground=ACCENT_HOVER,
        font=FONT_BUTTON_HERO,
        relief=tk.FLAT,
        cursor="hand2",
        padx=12,
        pady=11,
        borderwidth=0,
    )
    btn.pack(fill=tk.X)
    bind_button_hover(btn, ACCENT, ACCENT_HOVER)
    return btn


def card_panel(parent: tk.Misc, bg: str = INPUT_BG) -> tk.Frame:
    outer = tk.Frame(parent, bg=ACCENT_GLOW, padx=1, pady=1)
    outer.pack(fill=tk.X, pady=(0, 8))
    inner = tk.Frame(outer, bg=bg, padx=12, pady=10)
    inner.pack(fill=tk.X)
    return inner


def player_bind_panel(parent: tk.Misc) -> tuple[tk.Frame, tk.Label, tk.Label]:
    """Card showing account-bound in-game player."""
    inner = card_panel(parent)
    section_label(inner, "Bound player").pack(fill=tk.X)
    name_lbl = tk.Label(
        inner,
        text="—",
        bg=INPUT_BG,
        fg=TEXT,
        font=FONT_HERO,
        anchor=tk.CENTER,
        wraplength=300,
        justify=tk.CENTER,
    )
    name_lbl.pack(fill=tk.X, pady=(6, 2))
    sub_lbl = tk.Label(
        inner,
        text="Not bound yet",
        bg=INPUT_BG,
        fg=MUTED,
        font=FONT_LABEL,
        anchor=tk.CENTER,
        wraplength=300,
        justify=tk.CENTER,
    )
    sub_lbl.pack(fill=tk.X, pady=(0, 2))
    return inner, name_lbl, sub_lbl


def bottom_hint(parent: tk.Misc, text: str) -> tk.Label:
    footer = tk.Frame(parent, bg=CARD)
    footer.pack(side=tk.BOTTOM, fill=tk.X, pady=(8, 4))
    line = tk.Frame(footer, bg=RED, height=2)
    line.pack(fill=tk.X, padx=36, pady=(0, 8))
    lbl = tk.Label(
        footer,
        text=text,
        bg=CARD,
        fg=RED_SOFT,
        font=FONT_LABEL,
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
        font=FONT_BODY,
        relief=tk.FLAT,
        cursor="hand2",
        padx=10,
        pady=7,
        command=command,
    )
    bind_button_hover(btn, INPUT_BG, BORDER)
    return btn
