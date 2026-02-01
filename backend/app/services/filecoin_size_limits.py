"""
Filecoin Upload Size Limit Validation Service.

This module provides size validation for Filecoin uploads to ensure files
don't exceed the Synapse SDK's hard upload size limit of approximately 1 GiB.

The validation accounts for:
- Encryption overhead (~35% for base64 encoding via Lit Protocol)
- CAR file overhead (~1%)
- Safety margin (5%)
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class SizeValidationReason(Enum):
    """Reason for size validation failure."""
    TOO_SMALL = "TOO_SMALL"
    TOO_LARGE = "TOO_LARGE"
    ENCRYPTION_WOULD_EXCEED = "ENCRYPTION_WOULD_EXCEED"
    CAR_WOULD_EXCEED = "CAR_WOULD_EXCEED"


@dataclass
class FilecoinSizeValidationResult:
    """
    Result of file size validation for Filecoin upload.
    
    Attributes:
        valid: Whether the file size is valid for upload
        reason: Reason for validation failure (None if valid)
        original_size: Original file size in bytes
        projected_size: Projected size after encryption and CAR creation
        max_allowed: Maximum allowed original file size
        encryption_enabled: Whether encryption is enabled
        error_message: Technical error message for logging
        user_message: User-friendly error message for display
    """
    valid: bool
    reason: Optional[SizeValidationReason]
    original_size: int
    projected_size: int
    max_allowed: int
    encryption_enabled: bool
    error_message: Optional[str] = None
    user_message: Optional[str] = None


class FilecoinSizeLimits:
    """
    Filecoin upload size limit constants and utilities.
    
    These constants are based on the Synapse SDK's hard upload size limit
    and account for various overheads during the upload process.
    """
    
    # Hard upload size limit from Synapse SDK (~1 GiB)
    MAX_UPLOAD_SIZE = 1_065_353_216
    
    # Minimum size for PieceCIDv2 calculation
    MIN_UPLOAD_SIZE = 127
    
    # Encryption overhead factor (base64 encoding ~35%)
    ENCRYPTION_OVERHEAD_FACTOR = 1.35
    
    # CAR file overhead factor (~1%)
    CAR_OVERHEAD_FACTOR = 1.01
    
    # Safety margin for additional overhead (5%)
    SAFETY_MARGIN = 1.05

    @classmethod
    def format_bytes(cls, bytes_val: int) -> str:
        """
        Format bytes to human-readable string.
        
        Args:
            bytes_val: Size in bytes
            
        Returns:
            Human-readable string (e.g., "1.5 GB")
        """
        if bytes_val == 0:
            return "0 B"
        
        k = 1024
        sizes = ["B", "KB", "MB", "GB", "TB"]
        i = int(bytes_val // k ** min(len(sizes) - 1, int(bytes_val.bit_length() // 10)))
        i = min(i, len(sizes) - 1)
        
        # Calculate proper index based on log
        import math
        i = min(len(sizes) - 1, int(math.log(bytes_val, k)) if bytes_val > 0 else 0)
        
        return f"{bytes_val / (k ** i):.2f} {sizes[i]}"

    @classmethod
    def get_max_file_size(cls, encryption_enabled: bool = False) -> int:
        """
        Calculate the effective maximum file size based on encryption setting.
        
        Args:
            encryption_enabled: Whether Lit Protocol encryption is enabled
            
        Returns:
            Maximum allowed original file size in bytes
        """
        total_overhead = (
            cls.ENCRYPTION_OVERHEAD_FACTOR * cls.CAR_OVERHEAD_FACTOR * cls.SAFETY_MARGIN
            if encryption_enabled
            else cls.CAR_OVERHEAD_FACTOR * cls.SAFETY_MARGIN
        )
        
        return int(cls.MAX_UPLOAD_SIZE / total_overhead)

    @classmethod
    def calculate_projected_size(cls, file_size: int, encryption_enabled: bool = False) -> int:
        """
        Calculate projected upload size after encryption and CAR creation.
        
        Args:
            file_size: Original file size in bytes
            encryption_enabled: Whether Lit Protocol encryption is enabled
            
        Returns:
            Projected size in bytes after all transformations
        """
        projected_size = file_size
        
        # Account for encryption overhead
        if encryption_enabled:
            projected_size = int(projected_size * cls.ENCRYPTION_OVERHEAD_FACTOR)
        
        # Account for CAR overhead
        projected_size = int(projected_size * cls.CAR_OVERHEAD_FACTOR)
        
        # Account for safety margin
        projected_size = int(projected_size * cls.SAFETY_MARGIN)
        
        return projected_size


def validate_filecoin_upload_size(
    file_size: int,
    encryption_enabled: bool = False
) -> FilecoinSizeValidationResult:
    """
    Validate file size for Filecoin upload.
    
    Performs pre-flight size validation to ensure the file won't exceed
    the Synapse SDK's hard upload size limit after encryption and CAR creation.
    
    Args:
        file_size: Original file size in bytes
        encryption_enabled: Whether Lit Protocol encryption is enabled
        
    Returns:
        Validation result with detailed information
        
    Example:
        >>> result = validate_filecoin_upload_size(500_000_000, encryption_enabled=False)
        >>> result.valid
        True
        >>> result = validate_filecoin_upload_size(2_000_000_000, encryption_enabled=False)
        >>> result.valid
        False
        >>> result.reason
        SizeValidationReason.TOO_LARGE
    """
    # Check minimum size (for PieceCIDv2 calculation)
    if file_size < FilecoinSizeLimits.MIN_UPLOAD_SIZE:
        error_message = (
            f"File size ({file_size} bytes) is below minimum required size "
            f"({FilecoinSizeLimits.MIN_UPLOAD_SIZE} bytes) for Filecoin upload"
        )
        return FilecoinSizeValidationResult(
            valid=False,
            reason=SizeValidationReason.TOO_SMALL,
            original_size=file_size,
            projected_size=file_size,
            max_allowed=FilecoinSizeLimits.MIN_UPLOAD_SIZE,
            encryption_enabled=encryption_enabled,
            error_message=error_message,
            user_message=f"File is too small. Minimum size is {FilecoinSizeLimits.MIN_UPLOAD_SIZE} bytes.",
        )
    
    # Calculate projected size after encryption and CAR creation
    projected_size = FilecoinSizeLimits.calculate_projected_size(file_size, encryption_enabled)
    
    # Check against maximum upload size
    if projected_size > FilecoinSizeLimits.MAX_UPLOAD_SIZE:
        max_original_size = FilecoinSizeLimits.get_max_file_size(encryption_enabled)
        max_unencrypted = FilecoinSizeLimits.get_max_file_size(False)
        
        if encryption_enabled:
            error_message = (
                f"File size ({FilecoinSizeLimits.format_bytes(file_size)}) would exceed "
                f"{FilecoinSizeLimits.format_bytes(FilecoinSizeLimits.MAX_UPLOAD_SIZE)} limit after encryption. "
                f"Projected size: {FilecoinSizeLimits.format_bytes(projected_size)}. "
                f"Maximum allowed with encryption: {FilecoinSizeLimits.format_bytes(max_original_size)}. "
                f"Try disabling encryption (max unencrypted: {FilecoinSizeLimits.format_bytes(max_unencrypted)}) "
                f"or compressing the file."
            )
            user_message = (
                f"File ({FilecoinSizeLimits.format_bytes(file_size)}) would exceed "
                f"{FilecoinSizeLimits.format_bytes(FilecoinSizeLimits.MAX_UPLOAD_SIZE)} limit after encryption. "
                f"Try disabling encryption or compressing the file."
            )
            reason = SizeValidationReason.ENCRYPTION_WOULD_EXCEED
        else:
            error_message = (
                f"File size ({FilecoinSizeLimits.format_bytes(file_size)}) exceeds maximum upload size "
                f"of {FilecoinSizeLimits.format_bytes(max_original_size)}. "
                f"Projected CAR size: {FilecoinSizeLimits.format_bytes(projected_size)}. "
                f"Please compress or split the file."
            )
            user_message = (
                f"File ({FilecoinSizeLimits.format_bytes(file_size)}) exceeds "
                f"{FilecoinSizeLimits.format_bytes(max_original_size)} maximum upload size. "
                f"Please compress or split the file."
            )
            reason = SizeValidationReason.TOO_LARGE
        
        return FilecoinSizeValidationResult(
            valid=False,
            reason=reason,
            original_size=file_size,
            projected_size=projected_size,
            max_allowed=max_original_size,
            encryption_enabled=encryption_enabled,
            error_message=error_message,
            user_message=user_message,
        )
    
    # Validation passed
    return FilecoinSizeValidationResult(
        valid=True,
        reason=None,
        original_size=file_size,
        projected_size=projected_size,
        max_allowed=FilecoinSizeLimits.get_max_file_size(encryption_enabled),
        encryption_enabled=encryption_enabled,
    )
