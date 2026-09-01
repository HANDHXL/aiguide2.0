# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for AI 数字人导游系统
Build: pyinstaller run.spec
Output: dist/ai-tour-guide.exe
"""

import sys
from pathlib import Path

_block_cipher = None

# ---- Gather data files ----
_root = Path('.')
_datas = [
    # Frontend static files
    ('frontend/dist', 'frontend/dist'),
    # Live2D models (needed for digital human rendering)
    ('frontend/public/live2d', 'frontend/public/live2d'),
    ('frontend/public/avatar.png', 'frontend/public'),
]

# Add backend packages that PyInstaller might miss
_hidden_imports = [
    'sqlalchemy.sql.default_comparator',
    'sqlalchemy.ext.declarative',
    'pydantic',
    'pydantic.deprecated.decorator',
    'loguru',
    'chromadb',
    'chromadb.config',
    'chromadb.db',
    'chromadb.api',
    'chromadb.api.rust',
    'chromadb.telemetry',
    'chromadb.telemetry.product',
    'chromadb.telemetry.product.posthog',
    'sentence_transformers',
    'sentence_transformers.models',
    'langchain',
    'langchain_openai',
    'langchain_community',
    'langchain_huggingface',
    'langchain_text_splitters',
    'langchain_classic',
    'langchain_core',
    'langchain_core.messages',
    'docx',
    'openpyxl',
    'pypdf',
    'pandas',
    'numpy',
    'sklearn',
    'sklearn.utils',
    'sklearn.utils._chunking',
    'sklearn.utils._param_validation',
    'sklearn.metrics',
    'sklearn.metrics.pairwise',
    'sklearn.neighbors',
    'scipy',
    'scipy.sparse',
    'scipy.spatial',
    'scipy.stats',
    'PIL',
    'pydub',
    'soundfile',
    'librosa',
    'torch',
    'transformers',
    'websockets',
    'uvicorn',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'fastapi',
    'starlette',
    'jinja2',
]

# ---- Binary dependencies ----
_binaries = []

# Include chromadb's bundled SQLite DLL if present
_chroma_sqlite = list(Path('venv/Lib/site-packages/chromadb').glob('*.dll'))
for _dll in _chroma_sqlite:
    _binaries.append((str(_dll), 'chromadb'))

a = Analysis(
    ['run.py'],
    pathex=[],
    binaries=_binaries,
    datas=_datas,
    hiddenimports=_hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter', 'matplotlib', 'tensorflow',
        'torchvision', 'torchaudio', 'notebook', 'ipykernel',
        'jupyter', 'IPython', 'pytest', 'setuptools',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=_block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=_block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='ai-tour-guide',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Show console window for logs
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
