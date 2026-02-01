# Bundled Wheels

This directory contains pre-built binary wheels for dependencies that don't have official Python 3.14 support yet.

## libtorrent 2.0.11 for Python 3.14

**File:** `libtorrent-2.0.11-cp314-cp314-linux_x86_64.whl`

**Platform:** Linux x86_64 only

**Python Version:** 3.14+

**Build Details:**
- Built from libtorrent source (commit with Python 3.14 fixes)
- Boost 1.83.0 compiled with Python 3.14 support
- Patches applied to replace deprecated `distutils` with `sysconfig`:
  - `bindings/python/CMakeLists.txt` (line 98-99)
  - `bindings/python/Jamfile` (line 322)

**Tested:** All 94 unit tests pass with Python 3.14.2

### How It Works

The `requirements.txt` uses environment markers to select the appropriate wheel:

```txt
./wheels/libtorrent-2.0.11-cp314-cp314-linux_x86_64.whl; python_version >= "3.14" and platform_system == "Linux" and platform_machine == "x86_64"
libtorrent==2.0.11; python_version < "3.14"
```

This means:
- On Python 3.14+ Linux x86_64: Uses the bundled wheel
- On older Python versions: Uses official PyPI package
- On other platforms (macOS, Windows, ARM): Falls back to PyPI (may not work until official support)

### Rebuilding the Wheel

If you need to rebuild for a different Python 3.14 patch version or platform:

```bash
# See /home/tower/Documents/workspace/libtorrent/PYTHON_314_TEST_REPORT.md
# for detailed build instructions
```

### Future Migration

Once libtorrent officially supports Python 3.14 on PyPI:
1. Remove the bundled wheel from this directory
2. Update requirements.txt to use `libtorrent>=2.0.11` for all Python versions
3. Remove the platform-specific markers

### Troubleshooting

**ImportError: cannot import name 'libtorrent'**: Make sure you're using Python 3.14+ on Linux x86_64.

**Wheel tag mismatch**: If you get a "not supported wheel" error, the wheel may need to be rebuilt for your exact Python version. Contact the maintainer.
