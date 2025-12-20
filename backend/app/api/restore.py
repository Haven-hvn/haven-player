from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models.database import get_db
from app.services.arkiv_sync import ArkivSyncClient, build_arkiv_config
from app.services.evm_utils import InsufficientGasError, validate_evm_config

router = APIRouter()


@router.post("/arkiv")
def restore_from_arkiv(db: Session = Depends(get_db)) -> dict:
    """
    Restore catalog metadata from Arkiv into local DB (catalog-only).
    Requires Filecoin/Arkiv key to be configured.
    Validates EVM config and provides wallet address for gas error handling.
    """
    config = build_arkiv_config()
    client = ArkivSyncClient(config)

    if not config.enabled:
        raise HTTPException(status_code=400, detail="Arkiv sync is disabled (missing key). Configure Filecoin/Lit key first.")

    # Validate EVM config and return wallet info for user reference
    try:
        wallet_address, chain_name, token_symbol = validate_evm_config(config.private_key, config.rpc_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Log but don't fail - validation is informational
        import logging
        logger = logging.getLogger(__name__)
        logger.warning("Failed to validate EVM config during restore: %s", e)

    try:
        result = client.restore_catalog(db)
        return {"success": True, **result}
    except InsufficientGasError as gas_err:
        raise HTTPException(
            status_code=402,  # Payment Required
            detail=f"Insufficient {gas_err.native_token_symbol} for gas. Please send {gas_err.native_token_symbol} to address: {gas_err.wallet_address}"
        )

