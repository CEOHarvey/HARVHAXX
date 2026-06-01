import threading
import tkinter as tk
from datetime import datetime
from tkinter import messagebox, ttk

import requests

from loader.api_client import ApiClient, LicenseStatus, TokenResult
from loader import game_path, game_session, hwid, inject, inject_console, ko_launcher, payload, process_cleanup
from loader import player_bind
from loader.config import Settings
from loader.user_game_config import UserGameConfig
from loader import ui_animations as anim
from loader import ui_assets
from loader import ui_border_lightning
from loader import ui_theme as theme


class LoaderApp:
    def __init__(self, root: tk.Tk, settings: Settings):
        self.root = root
        self.settings = settings
        self.game_config = UserGameConfig.load()
        self.api = ApiClient(settings)
        self.hwid_hash = hwid.compute_hash(settings.hwid_salt)

        self.token: str | None = None
        self.username: str | None = None
        self.game_exe_path: str | None = None
        self.license_valid = False
        self.seconds_left = 0
        self.was_in_game = False
        self._current_panel = "login"
        self._exit_timer_id: str | None = None
        self._poll_timer_id: str | None = None
        self._license_timer_id: str | None = None
        self._login_progress: ttk.Progressbar | None = None
        self._hide_remaining = 0
        self._shutting_down = False

        root.title(theme.APP_NAME)
        root.geometry("364x540")
        root.minsize(364, 540)
        root.resizable(False, False)
        theme.style_root(root)
        self.brand = ui_assets.BrandAssets()
        self.brand.apply_to_window(root)
        root.protocol("WM_DELETE_WINDOW", self._on_close_request)
        root.bind_all("<Return>", self._on_global_return)
        root.bind_all("<KP_Enter>", self._on_global_return)

        self.border_fx = ui_border_lightning.RainbowLightningBorder(root)
        self.border_fx.start()
        self.card, self.brand_title = theme.make_shell(self.border_fx.inner, root)
        self.panels: dict[str, tk.Frame] = {}
        self.panels["login"] = self._build_login()
        self.panels["register"] = self._build_register()
        self.panels["license"] = self._build_license()
        self.panels["expired"] = self._build_expired()
        self.panels["main"] = self._build_main()

        threading.Thread(target=self.api.warmup, daemon=True).start()
        self._show_panel("login")

    def _on_global_return(self, _event=None) -> None:
        if self._current_panel == "login":
            self._login()
        elif self._current_panel == "register":
            self._register()
        elif self._current_panel == "license":
            self._activate()

    def _show_panel(self, name: str) -> None:
        self._current_panel = name
        for key, frame in self.panels.items():
            if key == name:
                frame.pack(fill=tk.BOTH, expand=True, padx=14, pady=10)
                anim.fade_in_panel(frame, self.root)
            else:
                frame.pack_forget()
        if name == "login":
            self.login_user.focus_set()
        if name == "main" and hasattr(self, "main_hint"):
            anim.pulse_label(self.main_hint, self.root)
        if name != "main":
            self._stop_game_poll()
            if name not in ("main", "expired"):
                self._stop_license_timer()

    def _set_busy(self, busy: bool, message: str = "") -> None:
        state = tk.DISABLED if busy else tk.NORMAL
        try:
            self.btn_login.config(state=state)
            self.btn_register_submit.config(state=state)
        except tk.TclError:
            pass
        if self._login_progress:
            if busy:
                self._login_progress.pack(fill=tk.X, pady=(0, 8))
                self._login_progress.start(12)
            else:
                self._login_progress.stop()
                self._login_progress.pack_forget()
        if busy and message:
            self.login_err.config(text=message, fg=theme.ACCENT)

    def _build_login(self) -> tk.Frame:
        f = tk.Frame(self.card, bg=theme.CARD)
        theme.brand_header(f, "Sign in to your account")

        theme.field_label(f, "Username").pack(fill=tk.X)
        self.login_user = theme.make_entry(f)
        theme.field_label(f, "Password").pack(fill=tk.X)
        self.login_pass = theme.make_entry(f, show="•")
        self.login_err = theme.make_message(f)
        self._login_progress = ttk.Progressbar(f, mode="indeterminate", style="TProgressbar")
        self.btn_login = theme.accent_button(f, "Sign in", self._login)
        theme.ghost_button(f, "Create account", lambda: self._show_panel("register"))
        return f

    def _build_register(self) -> tk.Frame:
        f = tk.Frame(self.card, bg=theme.CARD)
        theme.brand_header(f, "Create your account")
        theme.field_label(f, "Username").pack(fill=tk.X)
        self.reg_user = theme.make_entry(f)
        theme.field_label(f, "Email").pack(fill=tk.X)
        self.reg_email = theme.make_entry(f)
        theme.field_label(f, "Password").pack(fill=tk.X)
        self.reg_pass = theme.make_entry(f, show="•")
        self.reg_err = theme.make_message(f)
        self.btn_register_submit = theme.accent_button(f, "Register", self._register)
        theme.ghost_button(f, "Back to sign in", lambda: self._show_panel("login"))
        return f

    def _build_license(self) -> tk.Frame:
        f = tk.Frame(self.card, bg=theme.CARD)
        theme.brand_header(f, "Activate your license")
        theme.field_label(f, "License key").pack(fill=tk.X)
        self.license_key = theme.make_entry(f)
        self.license_err = theme.make_message(f)
        theme.accent_button(f, "Activate", self._activate)
        return f

    def _build_expired(self) -> tk.Frame:
        f = tk.Frame(self.card, bg=theme.CARD)
        theme.brand_header(f, "License status")
        self.expired_title = tk.Label(
            f,
            text="License expired",
            bg=theme.CARD,
            fg=theme.DANGER,
            font=(theme.FONT, 13, "bold"),
        )
        self.expired_title.pack(anchor=tk.CENTER)
        self.expired_detail = tk.Label(
            f,
            text="",
            bg=theme.CARD,
            fg=theme.TEXT,
            font=(theme.FONT, 9),
            wraplength=300,
            justify=tk.CENTER,
        )
        self.expired_detail.pack(anchor=tk.CENTER, pady=10)
        tk.Label(
            f,
            text="Discord: ceoharvey24",
            bg=theme.CARD,
            fg=theme.MUTED,
            font=(theme.FONT, 9),
        ).pack(anchor=tk.CENTER)
        theme.accent_button(f, "Enter license key", lambda: self._show_panel("license"))
        theme.ghost_button(f, "Sign out", self._sign_out)
        return f

    def _build_main(self) -> tk.Frame:
        f = tk.Frame(self.card, bg=theme.CARD)

        body = tk.Frame(f, bg=theme.CARD)
        body.pack(fill=tk.BOTH, expand=True)

        self.welcome_lbl = tk.Label(
            body,
            text="Welcome",
            bg=theme.CARD,
            fg=theme.ACCENT,
            font=(theme.FONT, 11, "bold"),
        )
        self.welcome_lbl.pack(anchor=tk.CENTER, pady=(0, 8))

        inner = theme.card_panel(body)
        self.status_lbl = tk.Label(
            inner,
            text="ACTIVE",
            bg=theme.INPUT_BG,
            fg=theme.SUCCESS,
            font=(theme.FONT, 10, "bold"),
        )
        self.status_lbl.pack(anchor=tk.CENTER)
        self.expires_lbl = tk.Label(
            inner, text="", bg=theme.INPUT_BG, fg=theme.MUTED, font=(theme.FONT, 9)
        )
        self.expires_lbl.pack(anchor=tk.CENTER, pady=(4, 0))
        self.remaining_lbl = tk.Label(
            inner,
            text="",
            bg=theme.INPUT_BG,
            fg=theme.ACCENT,
            font=(theme.FONT, 13, "bold"),
        )
        self.remaining_lbl.pack(anchor=tk.CENTER, pady=(4, 0))

        theme.field_label(inner, "Extend license (stack more time)").pack(fill=tk.X, pady=(10, 0))
        self.extend_key = theme.make_entry(inner)
        self.btn_extend = theme.ghost_button(inner, "Extend license", self._extend_license)

        self.game_path_lbl = tk.Label(
            body,
            text="",
            bg=theme.CARD,
            fg=theme.MUTED,
            font=(theme.FONT, 7),
            wraplength=300,
            justify=tk.CENTER,
        )
        self.game_path_lbl.pack(anchor=tk.CENTER, pady=(10, 4))
        self.game_state_lbl = tk.Label(
            body, text="", bg=theme.CARD, fg=theme.TEXT, font=(theme.FONT, 9)
        )
        self.game_state_lbl.pack(anchor=tk.CENTER)
        self.main_msg = theme.make_message(body)

        btn_row = tk.Frame(body, bg=theme.CARD)
        btn_row.pack(fill=tk.X, pady=(8, 4))
        self.btn_locate = theme.secondary_button(btn_row, "Locate game", self._locate_game)
        self.btn_locate.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=(0, 6))
        self.btn_start = theme.secondary_button(btn_row, "Start game", self._start_game)
        self.btn_start.configure(
            bg=theme.ACCENT,
            fg="#ffffff",
            activebackground=theme.ACCENT_HOVER,
            activeforeground="#ffffff",
            font=(theme.FONT, 10, "bold"),
        )
        theme.bind_button_hover(self.btn_start, theme.ACCENT, theme.ACCENT_HOVER)
        self.btn_start.pack(side=tk.LEFT, expand=True, fill=tk.X)

        self.btn_load = theme.hero_button(body, "Load Hacks", self._load_hacks)
        theme.ghost_button(body, "Sign out", self._sign_out)

        self.main_hint = theme.bottom_hint(f, "Load hack inside the game")
        return f

    @staticmethod
    def _friendly_auth_error(ex: BaseException) -> str:
        msg = str(ex)
        if "409" in msg or "another PC" in msg.lower():
            return "This account is already logged in on another PC. Close the loader there or wait ~2 minutes."
        if "Cannot reach API" in msg:
            return msg + " (check internet or wait for server to wake up)"
        return msg

    @staticmethod
    def _is_expired_or_blocked(status: LicenseStatus) -> bool:
        return status.status in ("expired", "revoked", "hwid_mismatch")

    def _run_async(self, work, on_ok, on_err=None, busy_message: str = "") -> None:
        if busy_message:
            self._set_busy(True, busy_message)

        def runner():
            try:
                result = work()
                self.root.after(0, lambda r=result: self._safe_call(on_ok, r, on_err, busy_message))
            except Exception as ex:
                self.root.after(0, lambda e=ex: self._safe_call_err(on_err, e, busy_message))

        threading.Thread(target=runner, daemon=True).start()

    def _safe_call(self, fn, result, on_err, busy_message: str) -> None:
        if busy_message:
            self._set_busy(False)
        try:
            fn(result)
        except Exception as ex:
            self._safe_call_err(on_err, ex, "")

    def _safe_call_err(self, on_err, ex: BaseException, busy_message: str) -> None:
        if busy_message:
            self._set_busy(False)
        if on_err:
            on_err(ex)
        else:
            messagebox.showerror("Error", str(ex))

    def _show_login_error(self, ex: BaseException) -> None:
        self.login_err.config(text=self._friendly_auth_error(ex), fg=theme.DANGER)

    def _login(self) -> None:
        if self._current_panel != "login":
            return
        username = self.login_user.get().strip()
        password = self.login_pass.get()
        if not username or not password:
            self.login_err.config(text="Enter username and password.", fg=theme.DANGER)
            return
        self.login_err.config(text="")

        def work():
            return self.api.login_and_validate(username, password, self.hwid_hash)

        def ok(result: tuple[TokenResult, LicenseStatus]):
            token, status = result
            self.token = token.access_token
            self.username = token.username
            self._finish_auth(status)

        self._run_async(work, ok, self._show_login_error, busy_message="Signing in...")

    def _register(self) -> None:
        username = self.reg_user.get().strip()
        email = self.reg_email.get().strip()
        password = self.reg_pass.get()
        if not username or not email or not password:
            self.reg_err.config(text="Fill in all fields.", fg=theme.DANGER)
            return
        self.reg_err.config(text="")

        def work():
            token = self.api.register(username, email, password, self.hwid_hash)
            self.api.set_token(token.access_token)
            status = self.api.validate(self.hwid_hash)
            return token, status

        def ok(result: tuple[TokenResult, LicenseStatus]):
            token, status = result
            self.token = token.access_token
            self.username = token.username
            self._finish_auth(status)

        self._run_async(
            work,
            ok,
            lambda e: self.reg_err.config(text=self._friendly_auth_error(e), fg=theme.DANGER),
            busy_message="Creating account...",
        )

    def _finish_auth(self, status: LicenseStatus) -> None:
        if status.valid:
            self._show_main(status)
        elif self._is_expired_or_blocked(status):
            self._show_expired(status)
        else:
            self._show_panel("license")

    def _activate(self) -> None:
        key = self.license_key.get().strip().upper()
        if not key:
            self.license_err.config(text="Enter a license key.", fg=theme.DANGER)
            return
        self.license_err.config(text="")

        def work():
            return self.api.activate(key, self.hwid_hash)

        def ok(status: LicenseStatus):
            if not status.valid:
                if self._is_expired_or_blocked(status):
                    self._show_expired(status)
                else:
                    self.license_err.config(text=status.message or "Activation failed", fg=theme.DANGER)
                return
            self._show_main(status)

        self._run_async(
            work,
            ok,
            lambda e: self.license_err.config(text=self._friendly_auth_error(e), fg=theme.DANGER),
        )

    def _show_expired(self, status: LicenseStatus) -> None:
        self.license_valid = False
        titles = {
            "revoked": "Your license was revoked",
            "hwid_mismatch": "HWID mismatch",
        }
        details = {
            "revoked": "This license key is no longer valid. Contact admin.",
            "hwid_mismatch": "This license is locked to another PC. Contact admin for HWID reset.",
        }
        self.expired_title.config(text=titles.get(status.status, "Your license has expired"))
        self.expired_detail.config(
            text=details.get(status.status, "Renew your license or contact admin on Discord.")
        )
        self._show_panel("expired")

    def _show_main(self, status: LicenseStatus) -> None:
        if not status.valid:
            self._show_expired(status)
            return
        self._show_panel("main")
        self.welcome_lbl.config(text=f"Welcome, {self.username}")
        self._apply_default_game_path()
        self._update_status_ui(status)
        self._start_license_timer()
        self._start_game_poll()

    def _extend_license(self) -> None:
        key = self.extend_key.get().strip().upper()
        if not key:
            self.main_msg.config(text="Enter a license key to extend.", fg=theme.DANGER)
            return
        self.main_msg.config(text="")

        def work():
            return self.api.extend_license(key, self.hwid_hash)

        def ok(status: LicenseStatus):
            if not status.valid:
                self.main_msg.config(
                    text=status.message or "Could not extend license.",
                    fg=theme.DANGER,
                )
                return
            self.extend_key.delete(0, tk.END)
            self._update_status_ui(status)
            self.main_msg.config(text="License extended — time added to your subscription.", fg=theme.SUCCESS)

        self._run_async(
            work,
            ok,
            lambda e: self.main_msg.config(text=self._friendly_auth_error(e), fg=theme.DANGER),
            busy_message="Extending license...",
        )

    def _apply_default_game_path(self) -> None:
        saved = self.game_config.game_exe_path or None
        resolved = game_path.resolve_best_game_exe(saved, self.settings.default_game_exe_path)
        if resolved:
            self.game_exe_path = resolved
            if self.game_config.game_exe_path != resolved:
                self.game_config.game_exe_path = resolved
                self.game_config.save()
            self.game_path_lbl.config(text=resolved)
        else:
            self.game_exe_path = None
            self.game_path_lbl.config(
                text="hyxd.exe not found — use Locate game or install to Program Files (x86)\\hyxd"
            )

    def _format_remaining(self, seconds: int) -> str:
        seconds = max(0, seconds)
        h, rem = divmod(seconds, 3600)
        m, s = divmod(rem, 60)
        return f"{h:02d}:{m:02d}:{s:02d}"

    def _update_status_ui(self, status: LicenseStatus) -> None:
        self.seconds_left = status.seconds_left
        self.license_valid = status.valid
        if status.valid:
            self.status_lbl.config(text="ACTIVE", fg=theme.SUCCESS)
            exp = "—"
            if status.expires_at:
                exp = status.expires_at.astimezone().strftime("%m/%d/%Y %I:%M %p")
            self.expires_lbl.config(text=f"Expires: {exp}")
            self.remaining_lbl.config(text=self._format_remaining(self.seconds_left))
            self.main_msg.config(text="", fg=theme.TEXT)
        else:
            if self._is_expired_or_blocked(status) and self._current_panel == "main":
                self._show_expired(status)
                return
            self.status_lbl.config(text=status.status.upper(), fg=theme.DANGER)
            self.remaining_lbl.config(text="00:00:00")
            self.main_msg.config(text=status.message, fg=theme.DANGER)
        self._refresh_game_state()

    def _refresh_game_state(self) -> None:
        from pathlib import Path

        running_exe = game_session.running_game_exe_path(self.game_exe_path)
        if running_exe:
            in_game = True
            if self.game_exe_path != running_exe:
                self.game_exe_path = running_exe
                self.game_config.game_exe_path = running_exe
                self.game_config.save()
                self.game_path_lbl.config(text=running_exe)
        else:
            in_game = game_session.is_game_running(self.game_exe_path)

        has_path = bool(
            self.game_exe_path
            and (Path(self.game_exe_path).is_file() or in_game)
        )
        can_load = self.license_valid and has_path and in_game
        start_enabled = self.license_valid and has_path

        if self.was_in_game and not in_game and has_path:
            process_cleanup.kill_ko_for_game(self.game_exe_path)

        if not self.license_valid:
            state = "Status: license expired or invalid"
        elif not has_path:
            state = "Status: hyxd.exe not found"
        elif in_game:
            state = "Status: in-game — ready to load hacks"
        elif ko_launcher.game_folder_has_ko(self.game_exe_path):
            state = "Status: KO.exe in game folder — press Start game"
        else:
            state = "Status: press Start game when ready"

        self.game_state_lbl.config(text=state)
        self.btn_load.config(state=tk.NORMAL if can_load else tk.DISABLED)
        self.btn_start.config(state=tk.NORMAL if start_enabled else tk.DISABLED)
        self.was_in_game = in_game

    def _start_game_poll(self) -> None:
        self._stop_game_poll()

        def tick():
            if self._current_panel == "main":
                self._refresh_game_state()
            self._poll_timer_id = self.root.after(2000, tick)

        tick()

    def _stop_game_poll(self) -> None:
        if self._poll_timer_id:
            self.root.after_cancel(self._poll_timer_id)
            self._poll_timer_id = None

    def _start_license_timer(self) -> None:
        self._stop_license_timer()

        def tick():
            if self.seconds_left > 0:
                self.seconds_left -= 1
                self.remaining_lbl.config(text=self._format_remaining(self.seconds_left))
            if self.seconds_left <= 0 and self.token:

                def work():
                    return self.api.validate(self.hwid_hash)

                def ok(status: LicenseStatus):
                    if not status.valid:
                        self._show_expired(status)
                    else:
                        self._update_status_ui(status)

                self._run_async(work, ok, self._show_login_error)
            self._license_timer_id = self.root.after(1000, tick)

        tick()

    def _stop_license_timer(self) -> None:
        if self._license_timer_id:
            self.root.after_cancel(self._license_timer_id)
            self._license_timer_id = None

    def _try_auto_start_game(self) -> None:
        self._apply_default_game_path()
        if not self.license_valid or not self.game_exe_path:
            return
        if game_path.is_launcher_path(self.game_exe_path):
            self.main_msg.config(
                text="Still pointing at launcher.exe — locate hyxd.exe manually.", fg=theme.DANGER
            )
            return
        if game_session.is_game_running(self.game_exe_path):
            self.main_msg.config(text="Game already running. Load hacks when in-game.", fg=theme.SUCCESS)
            self._refresh_game_state()
            return
        self._launch_ko(auto=True)

    def _locate_game(self) -> None:
        picked = game_session.pick_game_exe_path()
        if not picked:
            return
        resolved = game_path.resolve_for_direct_launch(picked)
        self.game_exe_path = resolved
        self.game_config.game_exe_path = resolved
        self.game_config.save()
        self.game_path_lbl.config(text=resolved)
        self.main_msg.config(text="Game path saved. Press Start game when ready.", fg=theme.SUCCESS)
        self._refresh_game_state()

    def _start_game(self) -> None:
        self._launch_ko(auto=False)

    def _launch_ko(self, auto: bool = False) -> None:
        if auto and ko_launcher.game_folder_has_ko(self.game_exe_path or ""):
            self.main_msg.config(text="KO.exe found — starting...", fg=theme.ACCENT)
        else:
            self.main_msg.config(text="Preparing KO.exe...", fg=theme.ACCENT)
        self.root.update_idletasks()
        self._apply_default_game_path()
        if not self.game_exe_path:
            self.main_msg.config(text=f"Game not found: {self.settings.default_game_exe_path}", fg=theme.DANGER)
            return
        if game_path.is_launcher_path(self.game_exe_path):
            self.main_msg.config(text="Wrong file: use hyxd.exe, not launcher.exe.", fg=theme.DANGER)
            return

        ko_path = ko_launcher.ko_path_in_game_folder(self.game_exe_path)
        if game_session.is_game_running(ko_path):
            self.main_msg.config(text="KO.exe is already running.", fg=theme.SUCCESS)
            self._refresh_game_state()
            return

        ok, dest, err = ko_launcher.ensure_ko_path(self.game_exe_path, self.settings)
        if not ok:
            self.main_msg.config(text=err, fg=theme.DANGER)
            return

        if ko_launcher.game_folder_has_ko(self.game_exe_path) and auto:
            msg = "Using existing KO.exe in game folder — starting..."
        elif ko_launcher.game_folder_has_ko(self.game_exe_path):
            msg = "Using existing KO.exe — starting..."
        else:
            msg = "KO.exe copied — starting..."
        self.main_msg.config(text=msg, fg=theme.ACCENT)
        self.root.update_idletasks()

        started, err2 = game_session.start_exe_as_admin(dest)
        if not started:
            self.main_msg.config(text=err2, fg=theme.DANGER)
            return
        self.main_msg.config(
            text="KO.exe started as administrator. Load hacks when hyxd is in-game.",
            fg=theme.SUCCESS,
        )
        self._refresh_game_state()

    def _load_hacks(self) -> None:
        self.main_msg.config(text="Injecting...", fg=theme.ACCENT)
        self.btn_load.config(state=tk.DISABLED)
        inject_console.attach()

        def work():
            status = self.api.validate(self.hwid_hash)
            if not status.valid:
                return ("expired", status)
            if not self.game_exe_path:
                return ("msg", "Locate hyxd.exe first.")
            if not game_session.is_game_running(self.game_exe_path):
                return ("msg", "Game is not running. Start game and enter in-game first.")

            inject_console.log("Scanning player name...")
            current_name = player_bind.try_read_player_name(
                self.game_exe_path, inject_console.log
            )
            if not current_name:
                return (
                    "msg",
                    "Cannot read player name yet. Please enter in-game first, then press Load Hacks again.",
                )

            inject_console.log(f"Player detected: {current_name}")
            bind = self.api.bind_player(current_name)
            if not bind.allowed:
                inject_console.log(f"BLOCKED: {bind.message}")
                return ("msg", bind.message or "ACCESS DENIED: account is bound to another player.")
            if bind.is_new_bind and bind.bound_name:
                inject_console.log(f"Bound to player: {bind.bound_name}")

            inject_console.log("Load hacks started")
            dll = payload.resolve_dll_path(self.settings, inject_console.log)
            try:
                ok, err = inject.try_inject_into_running_game(
                    self.game_exe_path, dll, inject_console.log
                )
            except OverflowError:
                inject_console.log("SUCCESS: inject done (cleanup warning only)")
                return ("inject_ok", None)
            if not ok:
                inject_console.log(f"FAILED: {err}")
                return ("msg", err)
            inject_console.log("SUCCESS: DLL loaded in game")
            return ("inject_ok", None)

        def ok(result):
            try:
                kind = result[0] if isinstance(result, tuple) else "msg"
                data = result[1] if isinstance(result, tuple) and len(result) > 1 else result
                if kind == "expired":
                    self.btn_load.config(state=tk.NORMAL)
                    self._show_expired(data)
                    return
                if kind == "msg":
                    self.btn_load.config(state=tk.NORMAL)
                    self.main_msg.config(text=str(data), fg=theme.DANGER)
                    self._refresh_game_state()
                    return
                if kind == "inject_ok":
                    self.root.after(0, self._finish_inject_success)
                    return
                self.btn_load.config(state=tk.NORMAL)
            except OverflowError:
                self.root.after(0, self._finish_inject_success)

        def err(ex):
            if isinstance(ex, OverflowError):
                self.root.after(0, self._finish_inject_success)
                return
            self.btn_load.config(state=tk.NORMAL)
            self.main_msg.config(text=str(ex), fg=theme.DANGER)

        self._run_async(work, ok, err)

    def _finish_inject_success(self) -> None:
        """Always runs on main thread after successful inject."""
        inject_console.close()
        self._stop_license_timer()

        if not self.root.winfo_viewable():
            self.root.deiconify()

        self.btn_load.config(state=tk.DISABLED)
        self.btn_start.config(state=tk.DISABLED)
        self.btn_locate.config(state=tk.DISABLED)

        if self._exit_timer_id:
            try:
                self.root.after_cancel(self._exit_timer_id)
            except tk.TclError:
                pass
            self._exit_timer_id = None

        self._hide_remaining = max(1, int(self.settings.exit_countdown_seconds))
        self._hide_countdown_tick()

    def _hide_countdown_tick(self) -> None:
        n = self._hide_remaining
        if n > 0:
            self.main_msg.config(
                text=f"SUCCESS! Injection complete. Closing loader in {n}s...",
                fg=theme.SUCCESS,
            )
            self.root.update_idletasks()
            self._hide_remaining = n - 1
            self._exit_timer_id = self.root.after(1000, self._hide_countdown_tick)
            return

        self.main_msg.config(text="Closing loader...", fg=theme.SUCCESS)
        self.root.update_idletasks()
        self._shutdown()

    def _on_close_request(self) -> None:
        self._shutdown()

    def _shutdown(self) -> None:
        if getattr(self, "_shutting_down", False):
            return
        self._shutting_down = True
        if hasattr(self, "border_fx"):
            self.border_fx.stop()
        if getattr(self, "brand_title", None):
            self.brand_title.stop()
        inject_console.close()
        self._stop_game_poll()
        self._stop_license_timer()
        if self._exit_timer_id:
            try:
                self.root.after_cancel(self._exit_timer_id)
            except tk.TclError:
                pass
        if self.token:
            try:
                self.api.logout()
            except requests.RequestException:
                pass
        try:
            self.root.destroy()
        except tk.TclError:
            pass

    def _sign_out(self) -> None:
        if not self.root.winfo_viewable():
            self.root.deiconify()
        self.token = None
        self.username = None
        self.api.set_token(None)
        self._stop_game_poll()
        self._stop_license_timer()
        self.was_in_game = False
        self.login_user.delete(0, tk.END)
        self.login_pass.delete(0, tk.END)
        self._show_panel("login")
