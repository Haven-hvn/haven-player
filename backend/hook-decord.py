# hook-decord.py
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# Collect the main decord folder (contains DLLs)
datas = collect_data_files('decord', include_py_files=False)

# Collect the submodules (Python code)
bins = collect_submodules('decord')