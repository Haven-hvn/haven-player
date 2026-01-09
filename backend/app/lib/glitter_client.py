import requests
import logging
from typing import List, Dict, Any
from app.models.config import AppConfig

logger = logging.getLogger(__name__)

def query_glitter_protocol(search_term: str, endpoint: str = "https://gw.magnode.ru/v1/sql/query") -> List[Dict[str, Any]]:
    """
    Queries the Glitter protocol for a given search term.

    Args:
        search_term: The search term to query
        endpoint: The Glitter endpoint URL (defaults to public endpoint)

    Returns:
        List of torrent metadata dictionaries
    """
    
    # Using a simplified query construction inspired by anybtsample.py
    queries = [f"file_name:'{search_term}'^1.0"]
    query_str = " ".join(queries)
    
    # Constructing the SQL, focusing on retrieving necessary fields
    sql = f"SELECT _id, file_name, filesize, total_count, firstadd_utc_timestamp FROM library.dht WHERE query_string_recency('{query_str}') ORDER BY firstadd_utc_timestamp DESC LIMIT 100"

    req = {"sql": sql, "arguments": []}

    try:
        r = requests.post(endpoint, json=req, timeout=30)
        if r.status_code != 200:
            logger.error(f"Glitter protocol query failed with status code {r.status_code}: {r.text}")
            return []
        
        results = r.json()
        if "result" not in results:
            logger.error(f"Glitter protocol response missing 'result' key: {results}")
            return []

        torrents = []
        for row in results["result"]:
            if "row" in row:
                data = {
                    "infohash": row["row"]["_id"]["value"],
                    "name": row["row"]["file_name"]["value"],
                    "size": int(float(row["row"]["filesize"]["value"])),
                    "seeders": int(float(row["row"]["total_count"]["value"])),
                    "discovered_at": int(float(row["row"]["firstadd_utc_timestamp"]["value"])),
                }
                torrents.append(data)
        
        return torrents

    except requests.RequestException as e:
        logger.error(f"Error querying Glitter protocol: {e}")
        return []
    except Exception as e:
        logger.error(f"An unexpected error occurred during Glitter protocol query: {e}")
        return []
