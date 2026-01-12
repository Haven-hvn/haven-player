"""
PumpFun plugin data models for Haven Player.

This module defines the database models for storing PumpFun stream subscriptions
and recording history with subscription-based auto-recording.
"""

# IMPORTANT: Classes have been removed as part of consolidation to JSON config storage.
# PumpFunPlugin now stores subscriptions in plugin.config["streams"] array.
# See backend/app/plugins/builtin/pumpfun_plugin.py for implementation.