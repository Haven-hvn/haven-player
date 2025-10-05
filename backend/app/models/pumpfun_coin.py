from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Integer, Text, Boolean, DateTime, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class PumpFunCoin(Base):
    """
    Model for storing pump.fun coin information for caching and historical tracking.
    This allows us to cache coin data and track changes over time.
    """
    __tablename__ = 'pumpfun_coins'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    
    # Core identification
    mint_id: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    
    # Basic coin info
    name: Mapped[str] = mapped_column(String, nullable=False)
    symbol: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Media
    image_uri: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    metadata_uri: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    banner_uri: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    thumbnail: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    video_uri: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    
    # Social links
    website: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    twitter: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    telegram: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    
    # Creator info
    creator: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    
    # Market data (updated frequently)
    market_cap: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    usd_market_cap: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ath_market_cap: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ath_market_cap_timestamp: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    # Trading info
    virtual_sol_reserves: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    virtual_token_reserves: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    real_sol_reserves: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    real_token_reserves: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_supply: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    # Status flags
    complete: Mapped[bool] = mapped_column(Boolean, default=False)
    hidden: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    nsfw: Mapped[bool] = mapped_column(Boolean, default=False)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False)
    show_name: Mapped[bool] = mapped_column(Boolean, default=True)
    hide_banner: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Live streaming info
    is_currently_live: Mapped[bool] = mapped_column(Boolean, default=False)
    num_participants: Mapped[int] = mapped_column(Integer, default=0)
    livestream_ban_expiry: Mapped[int] = mapped_column(Integer, default=0)
    livestream_downrank_score: Mapped[int] = mapped_column(Integer, default=0)
    
    # Engagement metrics
    reply_count: Mapped[int] = mapped_column(Integer, default=0)
    last_reply: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    downrank_score: Mapped[int] = mapped_column(Integer, default=0)
    
    # Timestamps from pump.fun
    created_timestamp: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_trade_timestamp: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    king_of_the_hill_timestamp: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    thumbnail_updated_at: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    # Our tracking timestamps
    first_seen: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    last_live_check: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    def to_dict(self) -> dict:
        """Convert to dictionary format."""
        return {
            'id': self.id,
            'mint_id': self.mint_id,
            'name': self.name,
            'symbol': self.symbol,
            'description': self.description,
            'image_uri': self.image_uri,
            'metadata_uri': self.metadata_uri,
            'banner_uri': self.banner_uri,
            'thumbnail': self.thumbnail,
            'video_uri': self.video_uri,
            'website': self.website,
            'twitter': self.twitter,
            'telegram': self.telegram,
            'creator': self.creator,
            'market_cap': self.market_cap,
            'usd_market_cap': self.usd_market_cap,
            'ath_market_cap': self.ath_market_cap,
            'ath_market_cap_timestamp': self.ath_market_cap_timestamp,
            'virtual_sol_reserves': self.virtual_sol_reserves,
            'virtual_token_reserves': self.virtual_token_reserves,
            'real_sol_reserves': self.real_sol_reserves,
            'real_token_reserves': self.real_token_reserves,
            'total_supply': self.total_supply,
            'complete': self.complete,
            'hidden': self.hidden,
            'nsfw': self.nsfw,
            'is_banned': self.is_banned,
            'show_name': self.show_name,
            'hide_banner': self.hide_banner,
            'is_currently_live': self.is_currently_live,
            'num_participants': self.num_participants,
            'livestream_ban_expiry': self.livestream_ban_expiry,
            'livestream_downrank_score': self.livestream_downrank_score,
            'reply_count': self.reply_count,
            'last_reply': self.last_reply,
            'downrank_score': self.downrank_score,
            'created_timestamp': self.created_timestamp,
            'last_trade_timestamp': self.last_trade_timestamp,
            'king_of_the_hill_timestamp': self.king_of_the_hill_timestamp,
            'thumbnail_updated_at': self.thumbnail_updated_at,
            'first_seen': self.first_seen.isoformat() if self.first_seen else None,
            'last_updated': self.last_updated.isoformat() if self.last_updated else None,
            'last_live_check': self.last_live_check.isoformat() if self.last_live_check else None
        }

    @classmethod
    def from_pumpfun_data(cls, data: dict) -> 'PumpFunCoin':
        """Create a PumpFunCoin instance from pump.fun API data."""
        return cls(
            mint_id=data.get("mint"),
            name=data.get("name"),
            symbol=data.get("symbol"),
            description=data.get("description"),
            image_uri=data.get("image_uri"),
            metadata_uri=data.get("metadata_uri"),
            banner_uri=data.get("banner_uri"),
            thumbnail=data.get("thumbnail"),
            video_uri=data.get("video_uri"),
            website=data.get("website"),
            twitter=data.get("twitter"),
            telegram=data.get("telegram"),
            creator=data.get("creator"),
            market_cap=data.get("market_cap"),
            usd_market_cap=data.get("usd_market_cap"),
            ath_market_cap=data.get("ath_market_cap"),
            ath_market_cap_timestamp=data.get("ath_market_cap_timestamp"),
            virtual_sol_reserves=data.get("virtual_sol_reserves"),
            virtual_token_reserves=data.get("virtual_token_reserves"),
            real_sol_reserves=data.get("real_sol_reserves"),
            real_token_reserves=data.get("real_token_reserves"),
            total_supply=data.get("total_supply"),
            complete=data.get("complete", False),
            hidden=data.get("hidden"),
            nsfw=data.get("nsfw", False),
            is_banned=data.get("is_banned", False),
            show_name=data.get("show_name", True),
            hide_banner=data.get("hide_banner", False),
            is_currently_live=data.get("is_currently_live", False),
            num_participants=data.get("num_participants", 0),
            livestream_ban_expiry=data.get("livestream_ban_expiry", 0),
            livestream_downrank_score=data.get("livestream_downrank_score", 0),
            reply_count=data.get("reply_count", 0),
            last_reply=data.get("last_reply"),
            downrank_score=data.get("downrank_score", 0),
            created_timestamp=data.get("created_timestamp"),
            last_trade_timestamp=data.get("last_trade_timestamp"),
            king_of_the_hill_timestamp=data.get("king_of_the_hill_timestamp"),
            thumbnail_updated_at=data.get("thumbnail_updated_at"),
            last_live_check=datetime.now(timezone.utc)
        )

    def update_from_pumpfun_data(self, data: dict) -> None:
        """Update existing coin data from pump.fun API data."""
        # Update basic info (these rarely change)
        self.name = data.get("name", self.name)
        self.symbol = data.get("symbol", self.symbol)
        self.description = data.get("description", self.description)
        
        # Update media (can change)
        self.image_uri = data.get("image_uri", self.image_uri)
        self.banner_uri = data.get("banner_uri", self.banner_uri)
        self.thumbnail = data.get("thumbnail", self.thumbnail)
        self.video_uri = data.get("video_uri", self.video_uri)
        
        # Update social links (can change)
        self.website = data.get("website", self.website)
        self.twitter = data.get("twitter", self.twitter)
        self.telegram = data.get("telegram", self.telegram)
        
        # Update market data (changes frequently)
        self.market_cap = data.get("market_cap", self.market_cap)
        self.usd_market_cap = data.get("usd_market_cap", self.usd_market_cap)
        self.ath_market_cap = data.get("ath_market_cap", self.ath_market_cap)
        self.ath_market_cap_timestamp = data.get("ath_market_cap_timestamp", self.ath_market_cap_timestamp)
        
        # Update reserves and supply
        self.virtual_sol_reserves = data.get("virtual_sol_reserves", self.virtual_sol_reserves)
        self.virtual_token_reserves = data.get("virtual_token_reserves", self.virtual_token_reserves)
        self.real_sol_reserves = data.get("real_sol_reserves", self.real_sol_reserves)
        self.real_token_reserves = data.get("real_token_reserves", self.real_token_reserves)
        
        # Update status flags
        self.complete = data.get("complete", self.complete)
        self.hidden = data.get("hidden", self.hidden)
        self.nsfw = data.get("nsfw", self.nsfw)
        self.is_banned = data.get("is_banned", self.is_banned)
        self.show_name = data.get("show_name", self.show_name)
        self.hide_banner = data.get("hide_banner", self.hide_banner)
        
        # Update live streaming info
        self.is_currently_live = data.get("is_currently_live", self.is_currently_live)
        self.num_participants = data.get("num_participants", self.num_participants)
        self.livestream_ban_expiry = data.get("livestream_ban_expiry", self.livestream_ban_expiry)
        self.livestream_downrank_score = data.get("livestream_downrank_score", self.livestream_downrank_score)
        
        # Update engagement metrics
        self.reply_count = data.get("reply_count", self.reply_count)
        self.last_reply = data.get("last_reply", self.last_reply)
        self.downrank_score = data.get("downrank_score", self.downrank_score)
        
        # Update timestamps
        self.last_trade_timestamp = data.get("last_trade_timestamp", self.last_trade_timestamp)
        self.king_of_the_hill_timestamp = data.get("king_of_the_hill_timestamp", self.king_of_the_hill_timestamp)
        self.thumbnail_updated_at = data.get("thumbnail_updated_at", self.thumbnail_updated_at)
        
        # Update our tracking
        self.last_live_check = datetime.now(timezone.utc)
