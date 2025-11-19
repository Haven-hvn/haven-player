"""
Setup script for Haven Player Backend
"""
from setuptools import setup, find_packages

setup(
    name="haven-player-backend",
    version="2.0.0",
    description="Backend API for Haven Player application",
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[
        # Dependencies are in requirements.txt
        # This setup.py is primarily for editable install
    ],
)

