# Bundled Dependencies

This directory contains pre-built binary wheels and system packages for dependencies that require specific compilation or platform support.

## libtorrent 2.0.11 for Python 3.14

**Files:**
- `libtorrent-2.0.11-cp314-cp314-linux_x86_64.whl` (Python Wheel)
- `libboost-python1.83.0_1.83.0-2.1ubuntu3.1_amd64.deb` (System Dependency)
- `libtorrent-rasterbar2.0t64_2.0.10-1.1build2_amd64.deb` (System Dependency)
- `setup_ld_path.sh` (Environment Configuration)
- `libs/` (Directory containing local shared libraries)

**Platform:** Linux x86_64 only  
**Python Version:** 3.14+

### Installation Steps

To ensure the `libtorrent` package works correctly within your virtual environment, the system library `libtorrent-rasterbar` must be accessible. The bundled wheel depends on the shared object `libtorrent-rasterbar.so.2.0`.

1. **Install System Dependencies:**
   Install the provided Boost and libtorrent system packages to ensure the shared libraries are available on your system.
   ```bash
   sudo dpkg -i wheels/libboost-python1.83.0_1.83.0-2.1ubuntu3.1_amd64.deb
   sudo dpkg -i wheels/libtorrent-rasterbar2.0t64_2.0.10-1.1build2_amd64.deb
   ```

2. **Configure Environment:**
   Run the provided setup script to configure your library path. This ensures the Python environment can locate the shared libraries.
   ```bash
   source wheels/setup_ld_path.sh
   ```

3. **Install Python Package:**
   Install the Python wheel into your virtual environment.
   ```bash
   pip install wheels/libtorrent-2.0.11-cp314-cp314-linux_x86_64.whl
   ```

### Source Details

The Python wheel is built from the HavenCTO/libtorrent fork, which includes necessary fixes for Python 3.14 compatibility.

**Build Configuration:**
- **Boost:** 1.83.0 compiled with Python 3.14 support.
- **Patches:** Replaces deprecated `distutils` with `sysconfig`.
  - As per [PEP 632](https://www.python.org/dev/peps/pep-0632/), the `distutils` module is deprecated and removed from the Python standard library in favor of `setuptools`.
  - Modified `bindings/python/CMakeLists.txt` (line 98-99).
  - Modified `bindings/python/Jamfile` (line 322).

### Rebuilding

If you need to rebuild the wheel or the system packages, refer to the source repository:
https://github.com/HavenCTO/libtorrent
