"""
Transcript Summarization Service.

This module handles LLM-based summarization of video transcripts.
Uses the existing FileCoin upload queue system for uploading summaries.
Uses multiplexer_llm for intelligent load balancing across multiple LLM providers.
"""

import asyncio
import json
import logging
import os
from typing import Dict, Any, Optional

from openai import AsyncOpenAI
from multiplexer_llm import Multiplexer

from app.models.database import get_db
from app.models.video import Video
from app.models.video_transcript import VideoTranscript
from app.models.config import AppConfig

logger = logging.getLogger(__name__)


async def generate_transcript_summary(
    transcript_id: int,
    video_id: int,
    video_path: str
) -> Optional[Dict[str, Any]]:
    """
    Generate an LLM summary from a video transcript.

    Args:
        transcript_id: VideoTranscript record ID
        video_id: Video record ID
        video_path: Path to the video file

    Returns:
        Summary JSON structure, or None if summarization failed
    """
    db = next(get_db())
    try:
        # Fetch transcript record
        transcript = db.query(VideoTranscript).filter(
            VideoTranscript.id == transcript_id
        ).first()

        if not transcript:
            logger.error(f"Transcript not found: {transcript_id}")
            return None

        # Check if already summarized
        if transcript.summary_cid:
            logger.info(f"Transcript {transcript_id} already has summary CID: {transcript.summary_cid}")
            return None

        # Get video context
        video = db.query(Video).filter(Video.id == video_id).first()
        if not video:
            logger.error(f"Video not found: {video_id}")
            return None

        # Get LLM config
        app_config = db.query(AppConfig).first()
        if not app_config:
            logger.error("No AppConfig found")
            return None

        # Build prompt for transcript summarization
        prompt = _build_summary_prompt(transcript.content, video)

        # Call LLM via multiplexer_llm (reuse existing VLM multiplexer config)
        summary_json = await _call_llm_for_summary(
            prompt=prompt,
            app_config=app_config
        )

        if not summary_json:
            logger.error(f"Failed to generate summary for transcript {transcript_id}")
            return None

        logger.info(f"✅ Generated summary for transcript {transcript_id}")
        return summary_json

    except Exception as e:
        logger.error(f"Error generating transcript summary: {e}", exc_info=True)
        return None
    finally:
        db.close()


def _build_summary_prompt(transcript_content: str, video: Video) -> str:
    """
    Build prompt for LLM transcript summarization.

    Args:
        transcript_content: Raw transcript text
        video: Video record for context

    Returns:
        Prompt string for LLM
    """
    # Truncate transcript if too long to fit in context
    # Most models have 128K-200K token context, but we should be conservative
    max_chars = 100000  # Approximately 25K tokens
    truncated_transcript = transcript_content[:max_chars]

    prompt = f"""You are an expert video content analyst. Please analyze the following YouTube video transcript and generate a structured summary.

Video Title: {video.title}
Video Channel: {video.creator_handle or 'Unknown'}
Video Duration: {video.duration or 0} seconds

TRANSCRIPT:
{truncated_transcript}

Please generate a JSON summary with the following structure:
{{
    "title": "Concise title for this summary",
    "main_topics": ["topic1", "topic2", "topic3"],
    "key_points": [
        {{
            "timestamp": "approximate time (e.g., '0:30', '1:45')",
            "point": "Brief summary of a key point"
        }}
    ],
    "overall_summary": "A 2-3 sentence overall summary of the video",
    "sentiment": "positive|negative|neutral",
    "duration_estimate_seconds": {video.duration or 0}
}}

Return ONLY valid JSON, no additional text."""

    return prompt


async def _call_llm_for_summary(
    prompt: str,
    app_config: AppConfig
) -> Optional[Dict[str, Any]]:
    """
    Call LLM via multiplexer_llm to generate summary.

    Uses the existing VLM multiplexer configuration for intelligent load balancing
    across multiple LLM providers with automatic failover and rate limit handling.

    Args:
        prompt: The prompt to send to LLM
        app_config: AppConfig containing multiplexer settings

    Returns:
        Summary JSON dict, or None if call failed
    """
    try:
        # Use multiplexer_llm for intelligent load balancing
        async with Multiplexer() as multiplexer:
            # Create clients for configured endpoints
            clients = await _create_multiplexer_clients(app_config)
            
            if not clients:
                logger.error("No valid LLM endpoints configured")
                return None

            # Add models to multiplexer
            model_count = 0
            for endpoint in app_config.vlm_multiplexer_endpoints or []:
                client = clients.get(endpoint.get("name"))
                if client and endpoint.get("name"):
                    model = endpoint.get("model", app_config.llm_model)
                    weight = endpoint.get("weight", 5)
                    
                    # Add as primary or fallback based on weight
                    if weight >= 5:
                        multiplexer.add_model(client, weight, model)
                    else:
                        multiplexer.add_fallback_model(client, weight, model)
                    
                    model_count += 1
                    logger.info(f"Added model '{model}' to multiplexer (weight: {weight})")

            if model_count == 0:
                logger.error("No models added to multiplexer")
                return None

            logger.info(f"Multiplexer configured with {model_count} model(s)")

            # Call LLM via multiplexer
            completion = await multiplexer.chat.completions.create(
                model="placeholder",  # Will be overridden by selected model
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.7,
                max_tokens=2048
            )

            # Extract content from response
            content = completion.choices[0].message.content

            # Log usage statistics
            stats = multiplexer.get_stats()
            logger.info(f"Multiplexer stats: {stats}")

            # Parse JSON from content
            try:
                summary_json = json.loads(content)
                logger.info(f"✅ Successfully parsed summary JSON")
                return summary_json
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse LLM response as JSON: {e}")
                logger.error(f"LLM response content: {content[:500]}...")
                return None

    except Exception as e:
        logger.error(f"Error calling LLM via multiplexer: {e}", exc_info=True)
        return None


async def _create_multiplexer_clients(app_config: AppConfig) -> Dict[str, AsyncOpenAI]:
    """
    Create OpenAI-compatible clients for each configured multiplexer endpoint.

    Args:
        app_config: AppConfig containing multiplexer endpoint configuration

    Returns:
        Dictionary mapping endpoint names to AsyncOpenAI clients
    """
    clients = {}
    
    if not app_config.vlm_multiplexer_endpoints:
        # No multiplexer endpoints configured, use legacy single endpoint
        logger.info("No multiplexer endpoints configured, using legacy single endpoint")
        clients["default"] = AsyncOpenAI(
            api_key=os.getenv("LLM_API_KEY", "dummy-key"),
            base_url=app_config.llm_base_url,
        )
        return clients
    
    for endpoint in app_config.vlm_multiplexer_endpoints:
        name = endpoint.get("name")
        base_url = endpoint.get("base_url")
        api_key = endpoint.get("api_key", os.getenv("LLM_API_KEY", "dummy-key"))
        
        if not name or not base_url:
            logger.warning(f"Skipping invalid endpoint: {endpoint}")
            continue
        
        try:
            clients[name] = AsyncOpenAI(
                api_key=api_key,
                base_url=base_url,
            )
            logger.debug(f"Created client for endpoint '{name}' at {base_url}")
        except Exception as e:
            logger.error(f"Failed to create client for endpoint '{name}': {e}")
    
    return clients
