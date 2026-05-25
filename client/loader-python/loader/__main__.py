import os
import sys

# PyInstaller onefile: ensure HTTPS can verify certificates
try:
    import certifi

    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
except ImportError:
    pass


def main() -> None:
    import tkinter as tk

    from loader.app import LoaderApp
    from loader.config import Settings

    settings = Settings.load()
    root = tk.Tk()
    LoaderApp(root, settings)
    root.mainloop()


if __name__ == "__main__":
    main()
