"""
Add DePIN stats fields to app_config table.

This migration adds the following columns:
- depin_points: Total DePIN points earned
- depin_daily_streak: Consecutive days of activity
- depin_is_active: Whether the DePIN node is currently active
- depin_last_tick: Timestamp of last DePIN tick
"""
import sqlite3
import sys
from pathlib import Path

# Get database path - typically in the backend directory
db_path = None

# Check common database locations
for possible_db in ["haven_player.db", "haven-player.db"]:
    db_file = Path(__file__).parent.parent.parent / possible_db
    if db_file.exists():
        db_path = str(db_file)
        break

if not db_path:
    print("Error: Database file not found")
    print("Please ensure haven_player.db or haven-player.db exists in the backend directory")
    sys.exit(1)


def migrate():
    """Add DePIN stats columns to app_config table."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check if depin_points column already exists
        cursor.execute("PRAGMA table_info(app_config)")
        columns = [column[1] for column in cursor.fetchall()]

        if "depin_points" in columns:
            print("✅ Migration already applied - DePIN stats columns exist")
            return

        print(f"📝 Adding DePIN stats columns to app_config table...")
        print(f"   Database: {db_path}")

        # Add DePIN stats columns
        cursor.execute("""
            ALTER TABLE app_config
            ADD COLUMN depin_points INTEGER DEFAULT 0;
        """)
        print("   ✅ Added depin_points column")

        cursor.execute("""
            ALTER TABLE app_config
            ADD COLUMN depin_daily_streak INTEGER DEFAULT 0;
        """)
        print("   ✅ Added depin_daily_streak column")

        cursor.execute("""
            ALTER TABLE app_config
            ADD COLUMN depin_is_active BOOLEAN DEFAULT 0;
        """)
        print("   ✅ Added depin_is_active column")

        cursor.execute("""
            ALTER TABLE app_config
            ADD COLUMN depin_last_tick TIMESTAMP;
        """)
        print("   ✅ Added depin_last_tick column")

        conn.commit()
        print("\n✅ Migration completed successfully!")
        print("\n📋 New columns added to app_config:")
        print("   - depin_points: INTEGER (default: 0)")
        print("   - depin_daily_streak: INTEGER (default: 0)")
        print("   - depin_is_active: BOOLEAN (default: 0)")
        print("   - depin_last_tick: TIMESTAMP")

    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
