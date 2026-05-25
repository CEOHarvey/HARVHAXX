"""Lightweight UI animations (tkinter-safe)."""

import tkinter as tk

from loader import ui_theme as theme


def fade_in_panel(frame: tk.Frame, root: tk.Misc, steps: int = 5) -> None:
    children = [
        w
        for w in frame.winfo_children()
        if isinstance(w, (tk.Label, tk.Button, tk.Entry, tk.Frame))
    ]
    if not children:
        return

    def step(i: int = 0):
        if i >= len(children):
            return
        w = children[i]
        try:
            if isinstance(w, tk.Label) and w.cget("text"):
                target = w.cget("fg")
                w.configure(fg=theme.CARD)
                root.after(25, lambda w=w, t=target: w.configure(fg=t))
        except tk.TclError:
            pass
        root.after(35, lambda: step(i + 1))

    root.after(15, step)


def pulse_label(label: tk.Label, root: tk.Misc, colors: tuple[str, str] | None = None) -> None:
    if colors is None:
        colors = (theme.RED_SOFT, theme.RED)
    state = {"on": True, "idx": 0}

    def tick():
        if not state["on"]:
            return
        try:
            if not label.winfo_exists():
                return
            label.configure(fg=colors[state["idx"] % 2])
            state["idx"] += 1
            root.after(850, tick)
        except tk.TclError:
            state["on"] = False

    root.after(300, tick)


def pulse_accent_line(line: tk.Frame, root: tk.Misc) -> None:
    colors = (theme.ACCENT_GLOW, theme.ACCENT)
    state = {"idx": 0}

    def tick():
        try:
            if not line.winfo_exists():
                return
            line.configure(bg=colors[state["idx"] % 2])
            state["idx"] += 1
            root.after(1200, tick)
        except tk.TclError:
            return

    root.after(500, tick)
