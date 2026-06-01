"""Animated rainbow gradient brand title: Harvcious Hacks."""

from __future__ import annotations

import colorsys
import tkinter as tk

from loader import ui_theme as theme


def _hue_hex(h: float, sat: float = 0.95, val: float = 1.0) -> str:
    r, g, b = colorsys.hsv_to_rgb((h % 360) / 360.0, sat, val)
    return f"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}"


class AnimatedBrandTitle:
    """Per-letter color cycle for smooth transitioning rainbow text."""

    DISPLAY = "Harvcious Hacks"
    TICK_MS = 55
    HUE_STEP = 2.8
    CHAR_OFFSET = 22.0

    def __init__(self, parent: tk.Misc, root: tk.Misc) -> None:
        self.root = root
        self._hue = 0.0
        self._running = False
        self._after_id: str | None = None

        self.frame = tk.Frame(parent, bg=theme.CARD)
        row = tk.Frame(self.frame, bg=theme.CARD)
        row.pack(anchor=tk.CENTER)

        self._letters: list[tk.Label] = []
        for i, ch in enumerate(self.DISPLAY):
            if ch == " ":
                tk.Label(row, text=" ", bg=theme.CARD, font=theme.FONT_TITLE).pack(
                    side=tk.LEFT
                )
                continue
            lbl = tk.Label(
                row,
                text=ch,
                bg=theme.CARD,
                fg=theme.ACCENT,
                font=theme.FONT_TITLE,
            )
            lbl.pack(side=tk.LEFT)
            self._letters.append((i, lbl))

        self.tagline = tk.Label(
            self.frame,
            text=theme.TAGLINE,
            bg=theme.CARD,
            fg=theme.RED_SOFT,
            font=(theme.FONT, 7, "bold"),
        )
        self.tagline.pack(anchor=tk.CENTER, pady=(2, 0))

        underline = tk.Frame(self.frame, bg=theme.RED, height=1)
        underline.pack(fill=tk.X, padx=24, pady=(2, 0))

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._tick()

    def stop(self) -> None:
        self._running = False
        if self._after_id:
            try:
                self.root.after_cancel(self._after_id)
            except tk.TclError:
                pass
            self._after_id = None

    def _tick(self) -> None:
        if not self._running:
            return
        self._hue = (self._hue + self.HUE_STEP) % 360.0
        for i, lbl in self._letters:
            hue = (self._hue + i * self.CHAR_OFFSET) % 360.0
            try:
                lbl.configure(fg=_hue_hex(hue, 0.92, 1.0))
            except tk.TclError:
                self.stop()
                return
        try:
            pulse = _hue_hex((self._hue + 180) % 360, 0.7, 0.85)
            self.tagline.configure(fg=pulse)
        except tk.TclError:
            pass
        self._after_id = self.root.after(self.TICK_MS, self._tick)
