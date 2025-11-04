#!/usr/bin/env python3
"""
Migration script to add Filecoin metadata fields to the videos table.
This script safely adds new columns to existing databases without data loss.
"""
import sqlite3
from pathlib import Path
from app.models.database import DB_PATH

def migrate_database():
    """Add Filecoin metadata columns to the videos table if they don't exist."""
    print(f"Checking database at: {DB_PATH}")
    
    if not DB_PATH.exists():
        print("⚠️  Database file doesn't exist yet. It will be created on next startup.")
        return
    
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    try:
        # Get existing columns
        cursor.execute("PRAGMA table_info(videos)")
        existing_columns = [row[1] for row in cursor.fetchall()]
        print(f"Existing columns: {existing_columns}")
        
        # Define new columns to add
        new_columns = [
            ("filecoin_root_cid", "TEXT"),
            ("filecoin_piece_cid", "TEXT"),
            ("filecoin_piece_id", "INTEGER"),
            ("filecoin_data_set_id", "TEXT"),
            ("filecoin_uploaded_at", "TIMESTAMP"),
        ]
        
        # Add columns that don't exist
        added_count = 0
        for column_name, column_type in new_columns:
            if column_name not in existing_columns:
                try:
                    cursor.execute(f"ALTER TABLE videos ADD COLUMN {column_name} {column_type}")
                    print(f"✅ Added column: {column_name}")
                    added_count += 1
                except sqlite3.OperationalError as e:
                    print(f"❌ Error adding column {column_name}: {e}")
            else:
                print(f"⏭️  Column {column_name} already exists, skipping")
        
        conn.commit()
        
        if added_count > 0:
            print(f"\n✅ Migration complete! Added {added_count} new column(s).")
        else:
            print("\n✅ Database is already up to date. No migration needed.")
            
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database()

