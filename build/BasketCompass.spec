# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the BasketCompass desktop launcher. It freezes
# installer/Launcher.py into a one-folder app and bundles the static dist/ web
# files alongside it, so the installed program serves the PWA on localhost with no
# Python, Node, or network required on the user's machine.
import os

project_root = os.path.dirname(SPECPATH)

analysis = Analysis(
    [os.path.join(project_root, 'installer', 'Launcher.py')],
    pathex=[project_root],
    binaries=[],
    datas=[(os.path.join(project_root, 'dist'), 'dist')],
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(analysis.pure)

exe = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name='BasketCompass',
    console=True,
    icon=os.path.join(project_root, 'brand', 'Icon.ico'),
)

collection = COLLECT(
    exe,
    analysis.binaries,
    analysis.datas,
    name='BasketCompass',
)
