import requests
import logging
import time
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple, Optional
from app.models.config import AppConfig

logger = logging.getLogger(__name__)

# Staleness threshold: warn if newest torrent is older than 30 days
STALE_DATA_THRESHOLD_DAYS = 30

def query_glitter_protocol(
    search_term: str, 
    endpoint: str = "https://gw.magnode.ru/v1/sql/query",
    filter_type: str = "video"
) -> List[Dict[str, Any]]:
    """
    Queries the Glitter protocol for a given search term.
    
    Based on AnyBT Java implementation - uses 'anybt' dataset with query_string function.

    Args:
        search_term: The search term to query
        endpoint: The Glitter endpoint URL (defaults to public endpoint)
        filter_type: Category filter (e.g., "video", "audio", "all"). Defaults to "video".

    Returns:
        List of torrent metadata dictionaries
    """
    
    # Build the SQL query following the Java AnyBT implementation:
    # - Use library.dht table
    # - Use query_string() function
    # - Order by firstadd_utc_timestamp DESC (newest first)
    # - Filter by category if filter_type is specified (not "all")
    if filter_type and filter_type.lower() != "all":
        sql = (
            f"SELECT file_name, filesize, total_count, _id, firstadd_utc_timestamp, category "
            f"FROM library.dht "
            f"WHERE query_string('file_name:{search_term}') AND category='{filter_type}' "
            f"ORDER BY firstadd_utc_timestamp DESC LIMIT 5"
        )
    else:
        sql = (
            f"SELECT file_name, filesize, total_count, _id, firstadd_utc_timestamp, category "
            f"FROM library.dht "
            f"WHERE query_string('file_name:{search_term}') "
            f"ORDER BY firstadd_utc_timestamp DESC LIMIT 5"
        )
    
    # The Java code uses dataset_name=anybt (this is the key fix!)
    req = {
        "sql": sql,
        "dataset_name": "anybt",
        "arguments": []
    }

    try:
        r = requests.post(endpoint, json=req, timeout=30)
        if r.status_code != 200:
            logger.error(f"Glitter protocol query failed with status code {r.status_code}: {r.text}")
            return []
        
        results = r.json()
        
        # Check for API-level errors
        if results.get("code") == 600004 and results.get("msg") == "dataset absent":
            logger.error(f"Glitter protocol dataset 'anybt' not found. The service may be unavailable.")
            return []
        
        if results.get("code") == 600006 and results.get("msg") == "internal error":
            logger.error(f"Glitter protocol service is experiencing internal errors. The indexer may be down.")
            return []
        
        if "result" not in results:
            logger.error(f"Glitter protocol response missing 'result' key: {results}")
            return []

        torrents = []
        for row in results["result"]:
            if "row" in row:
                row_data = row["row"]
                try:
                    data = {
                        "infohash": row_data["_id"]["value"],
                        "name": row_data["file_name"]["value"],
                        "size": int(float(row_data["filesize"]["value"])),
                        "seeders": int(float(row_data["total_count"]["value"])),
                        "discovered_at": int(float(row_data["firstadd_utc_timestamp"]["value"])),
                        "category": row_data.get("category", {}).get("value", "unknown"),
                    }
                    torrents.append(data)
                except (KeyError, ValueError) as e:
                    logger.warning(f"Skipping malformed torrent row: {e}")
                    continue
        
        # Check for stale data
        if torrents:
            newest_timestamp = max(t["discovered_at"] for t in torrents)
            newest_date = datetime.fromtimestamp(newest_timestamp)
            days_old = (datetime.now() - newest_date).days
            
            if days_old > STALE_DATA_THRESHOLD_DAYS:
                logger.warning(
                    f"Glitter index data is stale: newest torrent is {days_old} days old "
                    f"(newest: {newest_date.strftime('%Y-%m-%d')}). "
                    f"The indexer stopped updating around October 2025. "
                    f"Consider using an alternative indexer."
                )
        
        return torrents

    except requests.RequestException as e:
        logger.error(f"Error querying Glitter protocol: {e}")
        return []
    except Exception as e:
        logger.error(f"An unexpected error occurred during Glitter protocol query: {e}")
        return []


def get_glitter_index_status(endpoint: str = "https://gw.magnode.ru/v1/sql/query") -> Tuple[bool, Optional[datetime], str]:
    """
    Check the health of the Glitter index.
    
    Returns:
        Tuple of (is_available, newest_torrent_date, message)
    """
    sql = (
        "SELECT firstadd_utc_timestamp FROM library.dht "
        "ORDER BY firstadd_utc_timestamp DESC LIMIT 1"
    )
    
    req = {
        "sql": sql,
        "dataset_name": "anybt",
        "arguments": []
    }
    
    try:
        r = requests.post(endpoint, json=req, timeout=30)
        if r.status_code != 200:
            return (False, None, f"HTTP {r.status_code}")
        
        results = r.json()
        
        if results.get("code") == 600006:
            return (False, None, "Internal error - service down")
        
        if not results.get("result"):
            return (False, None, "No results")
        
        # Parse the newest timestamp
        newest_ts = int(float(results["result"][0]["row"]["firstadd_utc_timestamp"]["value"]))
        newest_date = datetime.fromtimestamp(newest_ts)
        days_old = (datetime.now() - newest_date).days
        
        if days_old > STALE_DATA_THRESHOLD_DAYS:
            return (True, newest_date, f"Stale data ({days_old} days old)")
        
        return (True, newest_date, f"Active (newest: {days_old} days old)")
        
    except Exception as e:
        return (False, None, str(e))
