"""
Add Arkiv sync tracking fields to upload_queue table.

This migration adds the following columns:
- arkiv_sync_status: Track Arkiv sync state (pending, syncing, completed, failed, skipped)
- arkiv_sync_started_at: When Arkiv sync started
- arkiv_sync_completed_at: When Arkiv sync completed (or failed/skipped)
- arkiv_sync_error: Error message if Arkiv sync failed
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
    """Add Arkiv sync columns to upload_queue table."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check if arkiv_sync_status column already exists
        cursor.execute("PRAGMA table_info(upload_queue)")
        columns = [column[1] for column in cursor.fetchall()]

        if "arkiv_sync_status" in columns:
            print("✅ Migration already applied - Arkiv sync columns exist")
            return

        print(f"📝 Adding Arkiv sync columns to upload_queue table...")
        print(f"   Database: {db_path}")

        # Add Arkiv sync columns
        cursor.execute("""
            ALTER TABLE upload_queue
            ADD COLUMN arkiv_sync_status TEXT;
        """)
        print("   ✅ Added arkiv_sync_status column")

        cursor.execute("""
            ALTER TABLE upload_queue
            ADD COLUMN arkiv_sync_started_at TIMESTAMP;
        """)
        print("   ✅ Added arkiv_sync_started_at column")

        cursor.execute("""
            ALTER TABLE upload_queue
            ADD COLUMN arkiv_sync_completed_at TIMESTAMP;
        """)
        print("   ✅ Added arkiv_sync_completed_at column")

        cursor.execute("""
            ALTER TABLE upload_queue
            ADD COLUMN arkiv_sync_error TEXT;
        """)
        print("   ✅ Added arkiv_sync_error column")

        conn.commit()
        print("\n✅ Migration completed successfully!")
        print("\n📋 New columns added to upload_queue:")
        print("   - arkiv_sync_status: TEXT (pending, syncing, completed, failed, skipped)")
        print("   - arkiv_sync_started_at: TIMESTAMP")
        print("   - arkiv_sync_completed_at: TIMESTAMP")
        print("   - arkiv_sync_error: TEXT")

    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
