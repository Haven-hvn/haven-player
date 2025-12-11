from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models.database import get_db
from app.services.arkiv_sync import ArkivSyncClient, build_arkiv_config

router = APIRouter()


@router.post("/arkiv")
def restore_from_arkiv(db: Session = Depends(get_db)) -> dict:
    """
    Restore catalog metadata from Arkiv into local DB (catalog-only).
    Requires Filecoin/Arkiv key to be configured.
    """
    config = build_arkiv_config()
    client = ArkivSyncClient(config)

    if not config.enabled:
        raise HTTPException(status_code=400, detail="Arkiv sync is disabled (missing key). Configure Filecoin/Lit key first.")

    result = client.restore_catalog(db)
    return {"success": True, **result}

