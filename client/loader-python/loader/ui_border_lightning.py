"""Animated rainbow lightning outline — smooth color transitions."""

from __future__ import annotations

import colorsys
import math
import tkinter as tk

from loader import ui_theme as theme


def _hue_hex(h: float, sat: float = 1.0, val: float = 1.0) -> str:
    r, g, b = colorsys.hsv_to_rgb((h % 360) / 360.0, max(0.0, min(1.0, sat)), max(0.0, min(1.0, val)))
    return f"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}"


def _lerp_hue(a: float, b: float, t: float) -> float:
    """Shortest-path hue blend for smooth rainbow transitions."""
    a %= 360.0
    b %= 360.0
    d = b - a
    if d > 180.0:
        d -= 360.0
    elif d < -180.0:
        d += 360.0
    return (a + d * t) % 360.0


def _perimeter_point(
    s: float, left: float, top: float, right: float, bottom: float
) -> tuple[float, float, float, float]:
    w = right - left
    h = bottom - top
    p = s % 1.0
    if p < 0.25:
        t = p / 0.25
        return left + t * w, top, 1.0, 0.0
    if p < 0.5:
        t = (p - 0.25) / 0.25
        return right, top + t * h, 0.0, 1.0
    if p < 0.75:
        t = (p - 0.5) / 0.25
        return right - t * w, bottom, -1.0, 0.0
    t = (p - 0.75) / 0.25
    return left, bottom - t * h, 0.0, -1.0


class RainbowLightningBorder:
    MARGIN = 6
    TICK_MS = 33
    TRAIL_STEPS = 96
    SUB_STEPS = 4
    SPARK_COUNT = 3
    PHASE_SPEED = 0.007

    def __init__(self, parent: tk.Misc) -> None:
        self.parent = parent
        self.phase = 0.0
        self._hue_phase = 0.0
        self._running = False
        self._after_id: str | None = None

        self.canvas = tk.Canvas(parent, bg=theme.BG, highlightthickness=0, bd=0)
        self.canvas.pack(fill=tk.BOTH, expand=True)

        self.inner = tk.Frame(self.canvas, bg=theme.BG)
        self._win = self.canvas.create_window(self.MARGIN, self.MARGIN, window=self.inner, anchor="nw")
        self.canvas.bind("<Configure>", self._on_resize)

    def _on_resize(self, event: tk.Event) -> None:
        m = self.MARGIN
        w = max(40, event.width - 2 * m)
        h = max(40, event.height - 2 * m)
        self.canvas.coords(self._win, m, m)
        self.canvas.itemconfig(self._win, width=w, height=h)

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._tick()

    def stop(self) -> None:
        self._running = False
        if self._after_id:
            try:
                self.parent.after_cancel(self._after_id)
            except tk.TclError:
                pass
            self._after_id = None

    def _tick(self) -> None:
        if not self._running:
            return
        try:
            if not self.canvas.winfo_exists():
                return
        except tk.TclError:
            return

        self.phase = (self.phase + self.PHASE_SPEED) % 1.0
        self._hue_phase = (self._hue_phase + 1.15) % 360.0
        self._draw()
        self._after_id = self.parent.after(self.TICK_MS, self._tick)

    def _hue_at(self, s: float) -> float:
        return (s * 360.0 + self._hue_phase) % 360.0

    def _draw(self) -> None:
        self.canvas.delete("fx")
        w = self.canvas.winfo_width()
        h = self.canvas.winfo_height()
        if w < 30 or h < 30:
            return

        m = self.MARGIN - 1
        left, top, right, bottom = m, m, w - m, h - m

        # Smooth rainbow ring: many segments + sub-steps with hue interpolation
        for i in range(self.TRAIL_STEPS):
            s0 = (i / self.TRAIL_STEPS + self.phase * 0.25) % 1.0
            s1 = ((i + 1) / self.TRAIL_STEPS + self.phase * 0.25) % 1.0
            h0 = self._hue_at(s0)
            h1 = self._hue_at(s1)
            x0, y0, _, _ = _perimeter_point(s0, left, top, right, bottom)
            x1, y1, _, _ = _perimeter_point(s1, left, top, right, bottom)

            for sub in range(self.SUB_STEPS):
                t0 = sub / self.SUB_STEPS
                t1 = (sub + 1) / self.SUB_STEPS
                mx0 = x0 + (x1 - x0) * t0
                my0 = y0 + (y1 - y0) * t0
                mx1 = x0 + (x1 - x0) * t1
                my1 = y0 + (y1 - y0) * t1
                hm = _lerp_hue(h0, h1, (t0 + t1) * 0.5)
                outer = _hue_hex(hm, 0.85, 0.5)
                inner = _hue_hex(hm, 0.95, 0.78)
                self.canvas.create_line(
                    mx0, my0, mx1, my1,
                    fill=outer,
                    width=3,
                    tags="fx",
                    capstyle=tk.ROUND,
                    smooth=True,
                )
                self.canvas.create_line(
                    mx0, my0, mx1, my1,
                    fill=inner,
                    width=1,
                    tags="fx",
                    capstyle=tk.ROUND,
                    smooth=True,
                )

        for j in range(self.SPARK_COUNT):
            s = (self.phase + j * (1.0 / self.SPARK_COUNT)) % 1.0
            self._draw_spark(s, left, top, right, bottom, j)

    def _draw_spark(
        self,
        s: float,
        left: float,
        top: float,
        right: float,
        bottom: float,
        seed: int,
    ) -> None:
        x, y, tx, ty = _perimeter_point(s, left, top, right, bottom)
        nx, ny = -ty, tx
        hue = self._hue_at(s)
        span = 16 + (seed % 2) * 4
        n_pts = 6
        pts: list[float] = []
        for k in range(n_pts):
            along = (k / (n_pts - 1) - 0.5) * span
            jag = math.sin(seed * 4.2 + k * 1.6 + self.phase * 18.0) * 4.5
            pts.extend([x + tx * along + nx * jag, y + ty * along + ny * jag])

        for i in range(0, len(pts) - 2, 2):
            t = i / max(1, len(pts) - 2)
            hm = _lerp_hue(hue, self._hue_at((s + 0.02) % 1.0), t)
            glow = _hue_hex(hm, 0.8, 0.55)
            core = _hue_hex(hm, 1.0, 1.0)
            self.canvas.create_line(
                pts[i], pts[i + 1], pts[i + 2], pts[i + 3],
                fill=glow,
                width=4,
                tags="fx",
                capstyle=tk.ROUND,
                smooth=True,
            )
            self.canvas.create_line(
                pts[i], pts[i + 1], pts[i + 2], pts[i + 3],
                fill=core,
                width=2,
                tags="fx",
                capstyle=tk.ROUND,
                smooth=True,
            )
