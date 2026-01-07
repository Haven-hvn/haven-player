"""
Plugin worker manager for Haven Player.

This module provides the PluginWorkerManager class which manages worker
processes from the control plane. It handles:
- Starting and stopping worker processes
- Submitting tasks to workers
- Collecting results from workers
- Monitoring worker health

This is the control plane component of the control/data plane separation.
"""

import multiprocessing as mp
import logging
import uuid
from typing import Dict, Any, Optional, List
import asyncio
from datetime import datetime, timezone

from app.plugins.plugin_worker import (
    WorkerTask,
    WorkerResult,
    WorkerProgress,
    worker_main,
)

logger = logging.getLogger(__name__)


class PluginWorkerManager:
    """
    Manages worker processes for plugins (Control Plane).
    
    This manager runs in the main FastAPI process and provides:
    - Worker process lifecycle management
    - Task queuing and dispatching
    - Result collection and status tracking
    - Worker health monitoring
    
    Example:
        worker_manager = PluginWorkerManager(max_workers=4)
        await worker_manager.start_worker("BitTorrentPlugin", {"max_downloads": 3})
        task = await worker_manager.submit_task("BitTorrentPlugin", "archive", source)
        result = await worker_manager.get_task_result(task["task_id"])
    """
    
    def __init__(self, max_workers: int = 4):
        """
        Initialize the worker manager.
        
        Args:
            max_workers: Maximum number of worker processes allowed
        """
        self.max_workers = max_workers
        self.workers: Dict[str, Dict[str, Any]] = {}  # plugin_name -> worker info
        self.active_tasks: Dict[str, Dict[str, Any]] = {}  # task_id -> task info
        self.task_results: Dict[str, Dict[str, Any]] = {}  # task_id -> result
        self._collector_tasks: Dict[str, asyncio.Task] = {}  # plugin_name -> collector task
    
    async def start_worker(
        self,
        plugin_name: str,
        plugin_config: Dict[str, Any]
    ) -> bool:
        """
        Start a worker process for a plugin.
        
        Args:
            plugin_name: Name of the plugin
            plugin_config: Configuration for the plugin
            
        Returns:
            True if worker started successfully, False otherwise
        """
        if plugin_name in self.workers:
            logger.warning(f"Worker already running for plugin: {plugin_name}")
            return True
        
        if len(self.workers) >= self.max_workers:
            logger.error(f"Max workers ({self.max_workers}) reached, cannot start worker for {plugin_name}")
            return False
        
        logger.info(f"Starting worker process for plugin: {plugin_name}")
        
        # Create queues for IPC
        task_queue = mp.Queue(maxsize=100)
        result_queue = mp.Queue()
        progress_queue = mp.Queue(maxsize=1000)
        
        # Start worker process
        worker_process = mp.Process(
            target=worker_main,
            args=(plugin_name, plugin_config, task_queue, result_queue, progress_queue),
            daemon=True
        )
        
        worker_process.start()
        logger.info(f"Started worker process for plugin: {plugin_name} (PID: {worker_process.pid})")
        
        # Store worker info
        self.workers[plugin_name] = {
            "process": worker_process,
            "task_queue": task_queue,
            "result_queue": result_queue,
            "progress_queue": progress_queue,
            "started_at": datetime.now(timezone.utc),
            "config": plugin_config,
        }
        
        # Start result collector
        collector_task = asyncio.create_task(self._collect_results(plugin_name))
        self._collector_tasks[plugin_name] = collector_task
        
        # Wait a moment for worker to initialize
        await asyncio.sleep(0.5)
        
        # Check if worker is still alive
        if not worker_process.is_alive():
            logger.error(f"Worker process for {plugin_name} died during initialization")
            await self.stop_worker(plugin_name)
            return False
        
        logger.info(f"✅ Worker process started successfully for plugin: {plugin_name}")
        return True
    
    async def stop_worker(self, plugin_name: str) -> bool:
        """
        Stop a worker process.
        
        Args:
            plugin_name: Name of the plugin
            
        Returns:
            True if worker stopped successfully, False otherwise
        """
        if plugin_name not in self.workers:
            logger.warning(f"No worker running for plugin: {plugin_name}")
            return False
        
        logger.info(f"Stopping worker for plugin: {plugin_name}")
        
        worker_info = self.workers[plugin_name]
        
        # Cancel collector task
        if plugin_name in self._collector_tasks:
            self._collector_tasks[plugin_name].cancel()
            try:
                await self._collector_tasks[plugin_name]
            except asyncio.CancelledError:
                pass
            del self._collector_tasks[plugin_name]
        
        # Send shutdown signal
        try:
            shutdown_task = WorkerTask(
                task_id="shutdown",
                task_type="shutdown",
                plugin_name=plugin_name,
                source={}
            )
            worker_info["task_queue"].put(shutdown_task.to_dict())
            
            # Wait for process to exit gracefully
            worker_info["process"].join(timeout=5)
            
            # Terminate if still running
            if worker_info["process"].is_alive():
                logger.warning(f"Worker for {plugin_name} did not exit gracefully, terminating")
                worker_info["process"].terminate()
                worker_info["process"].join(timeout=2)
        except Exception as e:
            logger.error(f"Error stopping worker for {plugin_name}: {e}")
        
        # Clean up queues
        try:
            worker_info["task_queue"].close()
            worker_info["result_queue"].close()
            worker_info["progress_queue"].close()
        except:
            pass
        
        # Mark tasks as failed
        for task_id, task_info in self.active_tasks.items():
            if task_info["plugin_name"] == plugin_name and task_info["status"] in ["pending", "running"]:
                task_info["status"] = "failed"
                task_info["error"] = "Worker process stopped"
                self.task_results[task_id] = {
                    "success": False,
                    "error": "Worker process stopped"
                }
        
        # Remove worker
        del self.workers[plugin_name]
        logger.info(f"✅ Stopped worker for plugin: {plugin_name}")
        
        return True
    
    async def submit_task(
        self,
        plugin_name: str,
        task_type: str,
        source: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Submit a task to a worker process.
        
        Args:
            plugin_name: Name of the plugin/worker
            task_type: Type of task ("archive", "discover", "health_check")
            source: Source data for the task
            
        Returns:
            Task information with task_id
        """
        if plugin_name not in self.workers:
            raise ValueError(f"No worker running for plugin: {plugin_name}")
        
        worker_info = self.workers[plugin_name]
        
        # Check if worker is alive
        if not worker_info["process"].is_alive():
            raise RuntimeError(f"Worker process for {plugin_name} is not alive")
        
        # Generate task ID
        task_id = str(uuid.uuid4())
        
        # Create task
        task = WorkerTask(
            task_id=task_id,
            task_type=task_type,
            plugin_name=plugin_name,
            source=source
        )
        
        # Submit to worker
        worker_info["task_queue"].put(task.to_dict())
        
        # Track active task
        self.active_tasks[task_id] = {
            "plugin_name": plugin_name,
            "task_type": task_type,
            "status": "queued",
            "submitted_at": datetime.now(timezone.utc),
            "source": source,
        }
        
        logger.info(f"Submitted task {task_id} to plugin {plugin_name} (type: {task_type})")
        
        # Return task info
        return {
            "task_id": task_id,
            "plugin_name": plugin_name,
            "task_type": task_type,
            "status": "queued",
        }
    
    async def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """
        Get status of a task.
        
        Args:
            task_id: ID of the task
            
        Returns:
            Task status information or None if not found
        """
        task_info = self.active_tasks.get(task_id)
        if not task_info:
            return None
        
        # Include result if available
        result = self.task_results.get(task_id)
        
        return {
            **task_info,
            "result": result,
        }
    
    async def get_task_result(self, task_id: str, timeout: Optional[float] = None) -> Optional[Dict[str, Any]]:
        """
        Get result of a task, optionally waiting for completion.
        
        Args:
            task_id: ID of the task
            timeout: Maximum time to wait in seconds (None = wait forever)
            
        Returns:
            Task result or None if not found/timeout
        """
        start_time = asyncio.get_event_loop().time()
        
        while True:
            result = self.task_results.get(task_id)
            if result:
                return result
            
            # Check timeout
            if timeout is not None:
                elapsed = asyncio.get_event_loop().time() - start_time
                if elapsed >= timeout:
                    return None
            
            # Wait before checking again
            await asyncio.sleep(0.1)
    
    async def _collect_results(self, plugin_name: str):
        """
        Background task to collect results from worker.
        
        Args:
            plugin_name: Name of the plugin to collect results for
        """
        worker_info = self.workers.get(plugin_name)
        if not worker_info:
            return
        
        logger.info(f"Started result collector for plugin: {plugin_name}")
        
        while True:
            try:
                # Check if we should stop collecting
                if asyncio.current_task().cancelled():
                    logger.info(f"Result collector for {plugin_name} cancelled")
                    break
                
                # Check if worker is still alive
                if not worker_info["process"].is_alive():
                    logger.warning(f"Worker for {plugin_name} died")
                    # Mark all active tasks as failed
                    for task_id, task_info in self.active_tasks.items():
                        if (task_info["plugin_name"] == plugin_name and
                            task_info["status"] in ["pending", "running", "queued"]):
                            task_info["status"] = "failed"
                            task_info["error"] = "Worker process died"
                            self.task_results[task_id] = {
                                "success": False,
                                "error": "Worker process died"
                            }
                    break
                
                # Try to get result (non-blocking)
                try:
                    result_dict = worker_info["result_queue"].get_nowait()
                    
                    result = WorkerResult(
                        task_id=result_dict["task_id"],
                        success=result_dict["success"],
                        data=result_dict.get("data"),
                        error=result_dict.get("error")
                    )
                    
                    # Update task status
                    if result.task_id in self.active_tasks:
                        task_info = self.active_tasks[result.task_id]
                        task_info["status"] = "completed" if result.success else "failed"
                        task_info["completed_at"] = datetime.now(timezone.utc)
                        
                        # Store result
                        self.task_results[result.task_id] = {
                            "success": result.success,
                            "data": result.data,
                            "error": result.error,
                        }
                        
                        if not result.success:
                            logger.error(f"Task {result.task_id} failed: {result.error}")
                        else:
                            logger.info(f"✅ Task {result.task_id} completed successfully")
                    else:
                        logger.warning(f"Received result for unknown task: {result.task_id}")
                
                except:
                    # No result available
                    pass
                
                # Wait before next check
                await asyncio.sleep(0.1)
            
            except asyncio.CancelledError:
                logger.info(f"Result collector for {plugin_name} cancelled")
                break
            
            except Exception as e:
                logger.error(f"Error in result collector for {plugin_name}: {e}", exc_info=True)
                await asyncio.sleep(1)
        
        logger.info(f"Result collector for {plugin_name} stopped")
    
    def get_worker_status(self, plugin_name: str) -> Optional[Dict[str, Any]]:
        """
        Get status of a worker process.
        
        Args:
            plugin_name: Name of the plugin
            
        Returns:
            Worker status information or None if not found
        """
        if plugin_name not in self.workers:
            return None
        
        worker_info = self.workers[plugin_name]
        
        return {
            "plugin_name": plugin_name,
            "pid": worker_info["process"].pid,
            "is_alive": worker_info["process"].is_alive(),
            "started_at": worker_info["started_at"].isoformat(),
            "tasks_queued": worker_info["task_queue"].qsize(),
            "active_tasks": sum(
                1 for t in self.active_tasks.values()
                if t["plugin_name"] == plugin_name and t["status"] in ["pending", "running", "queued"]
            ),
        }
    
    def list_workers(self) -> List[Dict[str, Any]]:
        """
        List all workers and their status.
        
        Returns:
            List of worker status information
        """
        return [self.get_worker_status(name) for name in self.workers.keys()]
    
    async def stop_all_workers(self) -> bool:
        """
        Stop all worker processes.
        
        Returns:
            True if all workers stopped successfully
        """
        logger.info("Stopping all workers")
        
        all_stopped = True
        for plugin_name in list(self.workers.keys()):
            success = await self.stop_worker(plugin_name)
            if not success:
                all_stopped = False
        
        return all_stopped
    
    def get_queue_size(self, plugin_name: str) -> Optional[int]:
        """
        Get queue size for a worker.
        
        Args:
            plugin_name: Name of the plugin
            
        Returns:
            Queue size or None if worker not found
        """
        if plugin_name not in self.workers:
            return None
        
        return self.workers[plugin_name]["task_queue"].qsize()
    
    async def health_check_all_workers(self) -> Dict[str, bool]:
        """
        Health check all workers.
        
        Returns:
            Dictionary mapping plugin names to health status
        """
        health_status = {}
        
        for plugin_name, worker_info in self.workers.items():
            is_healthy = (
                worker_info["process"].is_alive() and
                worker_info["process"].exitcode is None
            )
            health_status[plugin_name] = is_healthy
        
        return health_status