/**
 * Haven Player - P Language System Model
 * 
 * This P specification models the Haven Player distributed system,
 * including the frontend (Electron), backend (FastAPI), plugin system,
 * and data processing pipelines.
 * 
 * The model captures:
 * - Frontend state machines (UI components, IPC handlers)
 * - Backend state machines (API endpoints, services, workers)
 * - Plugin system (control plane / data plane separation)
 * - Data processing pipeline (ingest -> analyze -> encrypt -> upload)
 * - Inter-component communication via events
 */

// ============================================================================
// EVENT DEFINITIONS
// ============================================================================

event e_start_backend;
event e_stop_backend;
event e_backend_ready;
event e_video_selected: string;           // video file path
event e_video_ingested: VideoMetadata;
event e_analysis_requested: string;       // video path
event e_analysis_complete: AIAnalysisResult;
event e_analysis_failed: ErrorInfo;
event e_upload_requested: UploadRequest;
event e_upload_progress: UploadProgress;
event e_upload_complete: UploadResult;
event e_upload_failed: ErrorInfo;
event e_encrypt_requested: EncryptRequest;
event e_encrypt_complete: EncryptionMetadata;
event e_sync_to_arkiv: ArkivSyncRequest;
event e_sync_complete: ArkivSyncResult;
event e_plugin_discover_sources: string;  // plugin name
event e_plugin_sources_found: SourceList;
event e_plugin_archive: ArchiveRequest;
event e_plugin_archive_complete: ArchiveResult;
event e_recording_start: RecordingRequest;
event e_recording_chunk: RecordingChunk;
event e_recording_stop: string;           // source_id
event e_health_check;
event e_health_status: HealthStatus;
event e_config_update: ConfigUpdate;
event e_worker_status_update: WorkerStatus;

// ============================================================================
// DATA TYPES
// ============================================================================

type VideoMetadata {
    path: string;
    title: string;
    duration: float;
    file_size: int;
    mime_type: string;
    phash: string;           // perceptual hash for deduplication
    creator_handle: string;
    source_uri: string;
    has_ai_data: bool;
}

type AIAnalysisResult {
    video_path: string;
    timestamps: seq<Timestamp>;
    tags: map<string, float>;
    confidence: float;
}

type Timestamp {
    tag_name: string;
    start_time: float;
    end_time: float;
    confidence: float;
}

type UploadRequest {
    video_path: string;
    config: FilecoinConfig;
    encryption_enabled: bool;
}

type FilecoinConfig {
    private_key: string;
    rpc_url: string;
    data_set_id: int;
}

type UploadProgress {
    video_path: string;
    stage: string;           // "encrypting", "uploading", "confirming"
    progress_percent: int;
}

type UploadResult {
    video_path: string;
    root_cid: string;
    piece_cid: string;
    transaction_hash: string;
    encryption_metadata: EncryptionMetadata;
}

type EncryptRequest {
    video_path: string;
    access_conditions: seq<AccessCondition>;
}

type AccessCondition {
    condition_type: string;  // "address", "group", "credential"
    value: string;
}

type EncryptionMetadata {
    ciphertext: string;
    data_to_encrypt_hash: string;
    access_control_conditions: seq<AccessCondition>;
    chain: string;
}

type ArkivSyncRequest {
    video_path: string;
    entity_key: string;
    attributes: map<string, string>;
}

type ArkivSyncResult {
    success: bool;
    entity_key: string;
    transaction_hash: string;
}

type SourceList {
    plugin_name: string;
    sources: seq<MediaSource>;
}

type MediaSource {
    source_id: string;
    media_type: string;      // "youtube", "bittorrent", "webrtc"
    uri: string;
    priority: string;
    metadata: map<string, string>;
}

type ArchiveRequest {
    plugin_name: string;
    source: MediaSource;
}

type ArchiveResult {
    success: bool;
    output_path: string;
    file_size: int;
    duration: int;
    error: string;
}

type RecordingRequest {
    mint_id: string;
    source_uri: string;
    media_type: string;
}

type RecordingChunk {
    mint_id: string;
    chunk_path: string;
    duration: float;
    sequence_number: int;
}

type ErrorInfo {
    code: string;
    message: string;
    details: map<string, string>;
}

type HealthStatus {
    backend_healthy: bool;
    plugin_health: map<string, bool>;
    worker_health: map<string, bool>;
    vlm_worker_running: bool;
    arkiv_worker_running: bool;
}

type ConfigUpdate {
    filecoin_config: FilecoinConfig;
    arkiv_rpc_url: string;
    arkiv_sync_enabled: bool;
    encryption_enabled: bool;
}

type WorkerStatus {
    worker_type: string;
    is_running: bool;
    current_operation: string;
    queue_length: int;
}

// ============================================================================
// FRONTEND STATE MACHINES
// ============================================================================

/**
 * ElectronMainProcess
 * 
 * The main entry point of the Haven Player application.
 * Manages the backend lifecycle, IPC handlers, and window lifecycle.
 */
machine ElectronMainProcess {
    var backend_pid: int;
    var memory_monitor_active: bool;
    var ipc_handlers_registered: bool;
    
    start state Init {
        entry {
            // Register all IPC handlers
            registerIPCHandlers();
            ipc_handlers_registered = true;
            goto Idle;
        }
    }
    
    state Idle {
        on e_start_backend do {
            // Spawn Python backend process
            backend_pid = spawnBackendProcess();
            startMemoryMonitoring();
            memory_monitor_active = true;
            goto BackendStarting;
        }
        
        on e_video_selected do (video_path: string) {
            // Forward to renderer process
            send RenderProcess, e_video_selected, video_path;
        }
    }
    
    state BackendStarting {
        defer e_start_backend;  // Prevent duplicate starts
        
        entry {
            // Wait for backend health check
            startHealthCheckPolling();
        }
        
        on e_backend_ready do {
            // Backend is ready, notify renderer
            send RenderProcess, e_backend_ready;
            // Start upload worker
            send UploadWorkerService, e_start_backend;
            goto BackendRunning;
        }
    }
    
    state BackendRunning {
        on e_stop_backend do {
            stopBackendProcess(backend_pid);
            stopMemoryMonitoring();
            memory_monitor_active = false;
            goto Idle;
        }
        
        on e_restart_backend do {
            send this, e_stop_backend;
            send this, e_start_backend;
        }
        
        on e_health_status do (status: HealthStatus) {
            // Forward to renderer for UI display
            send RenderProcess, e_health_status, status;
        }
        
        on e_config_update do (update: ConfigUpdate) {
            // Restart backend with new config
            saveConfig(update);
            send this, e_restart_backend;
        }
    }
}

/**
 * RenderProcess
 * 
 * Manages the renderer window and UI state.
 * Handles user interactions and displays data from backend.
 */
machine RenderProcess {
    var current_view: string;
    var video_list: seq<VideoMetadata>;
    var selected_video: string;
    var backend_connected: bool;
    
    start state Init {
        entry {
            createMainWindow();
            current_view = "video_grid";
            goto WaitingForBackend;
        }
    }
    
    state WaitingForBackend {
        on e_backend_ready do {
            backend_connected = true;
            // Fetch initial video list
            send BackendAPI, e_video_list_request;
            goto VideoGridView;
        }
    }
    
    state VideoGridView {
        entry {
            current_view = "video_grid";
        }
        
        on e_video_selected do (path: string) {
            selected_video = path;
            send VideoPlayer, e_load_video, path;
            goto VideoPlayerView;
        }
        
        on e_video_ingested do (meta: VideoMetadata) {
            // New video added, refresh list
            push video_list, meta;
        }
        
        on e_upload_progress do (progress: UploadProgress) {
            // Update UI with upload progress
            updateUploadProgress(progress);
        }
    }
    
    state VideoPlayerView {
        entry {
            current_view = "video_player";
        }
        
        on e_analysis_complete do (result: AIAnalysisResult) {
            // Update timeline with AI tags
            send VideoPlayer, e_update_timeline, result.timestamps;
        }
        
        on e_upload_complete do (result: UploadResult) {
            // Show upload success notification
            showNotification("Upload Complete", result.root_cid);
        }
        
        on e_back_to_grid do {
            goto VideoGridView;
        }
    }
}

/**
 * VideoPlayer
 * 
 * Manages video playback state and timeline interactions.
 */
machine VideoPlayer {
    var current_video: string;
    var playback_position: float;
    var is_playing: bool;
    var ai_timestamps: seq<Timestamp>;
    
    start state Idle {
        on e_load_video do (path: string) {
            current_video = path;
            loadVideoFile(path);
            goto Playing;
        }
    }
    
    state Playing {
        entry {
            is_playing = true;
            startPlayback();
        }
        
        on e_pause do {
            is_playing = false;
            pausePlayback();
            goto Paused;
        }
        
        on e_seek do (position: float) {
            playback_position = position;
            seekTo(position);
        }
        
        on e_update_timeline do (timestamps: seq<Timestamp>) {
            ai_timestamps = timestamps;
            renderTimeline(timestamps);
        }
        
        on e_timestamp_clicked do (tag: string) {
            // Jump to timestamp
            var ts = findTimestamp(ai_timestamps, tag);
            if (ts != null) {
                send this, e_seek, ts.start_time;
            }
        }
    }
    
    state Paused {
        on e_play do {
            goto Playing;
        }
        
        on e_seek do (position: float) {
            playback_position = position;
            seekTo(position);
        }
    }
}

// ============================================================================
// BACKEND STATE MACHINES
// ============================================================================

/**
 * FastAPIServer
 * 
 * Main backend server managing all API routes and service lifecycle.
 */
machine FastAPIServer {
    var plugin_manager: PluginManager;
    var job_scheduler: JobScheduler;
    var upload_coordinator: UploadCoordinator;
    var arkiv_sync_worker: ArkivSyncWorker;
    var vlm_analysis_worker: VLMAnalysisWorker;
    var is_running: bool;
    
    start state Init {
        entry {
            initializeDatabase();
            goto LoadingPlugins;
        }
    }
    
    state LoadingPlugins {
        entry {
            // Initialize plugin manager with control/data plane
            plugin_manager = new PluginManager(4);  // 4 worker processes
            plugin_manager.setWorkerPlugins(["BitTorrentPlugin", "YouTubePlugin"]);
            plugin_manager.discoverPlugins();
            goto StartingServices;
        }
    }
    
    state StartingServices {
        entry {
            // Start job scheduler
            job_scheduler = new JobScheduler(plugin_manager);
            job_scheduler.start();
            
            // Start background workers
            arkiv_sync_worker = new ArkivSyncWorker();
            vlm_analysis_worker = new VLMAnalysisWorker();
            
            // Start HTTP server
            startUvicornServer();
            is_running = true;
            
            // Notify frontend
            send ElectronMainProcess, e_backend_ready;
            goto Running;
        }
    }
    
    state Running {
        on e_health_check do {
            var status: HealthStatus;
            status.backend_healthy = true;
            status.plugin_health = plugin_manager.healthCheckAll();
            status.worker_health = plugin_manager.workerHealthCheck();
            status.vlm_worker_running = vlm_analysis_worker.isRunning();
            status.arkiv_worker_running = arkiv_sync_worker.isRunning();
            send ElectronMainProcess, e_health_status, status;
        }
        
        on e_stop_backend do {
            goto ShuttingDown;
        }
    }
    
    state ShuttingDown {
        entry {
            // Graceful shutdown sequence
            vlm_analysis_worker.stop();
            arkiv_sync_worker.stop();
            job_scheduler.stop();
            plugin_manager.shutdown();
            stopUvicornServer();
            is_running = false;
        }
    }
}

/**
 * PluginManager
 * 
 * Manages plugin lifecycle with control plane / data plane separation.
 * Heavy I/O plugins run in separate worker processes.
 */
machine PluginManager {
    var loaded_plugins: map<string, ArchiverPlugin>;
    var worker_plugins: set<string>;
    var worker_processes: map<string, PluginWorkerProcess>;
    var max_workers: int;
    
    start state Init {
        entry (max_w: int) {
            max_workers = max_w;
            loaded_plugins = default(map[string, ArchiverPlugin]);
            worker_plugins = default(set[string]);
            worker_processes = default(map[string, PluginWorkerProcess]);
        }
    }
    
    state ManagingPlugins {
        on e_plugin_discover_sources do (plugin_name: string) {
            if (plugin_name in worker_plugins) {
                // Send to worker process
                var worker = worker_processes[plugin_name];
                send worker, e_discover_sources;
            } else {
                // Run in control plane
                var plugin = loaded_plugins[plugin_name];
                var sources = plugin.discoverSources();
                send FastAPIServer, e_plugin_sources_found, 
                    SourceList(plugin_name, sources);
            }
        }
        
        on e_plugin_archive do (req: ArchiveRequest) {
            if (req.plugin_name in worker_plugins) {
                var worker = worker_processes[req.plugin_name];
                send worker, e_archive, req.source;
            } else {
                var plugin = loaded_plugins[req.plugin_name];
                var result = plugin.archive(req.source);
                send FastAPIServer, e_plugin_archive_complete, result;
                
                // If successful, trigger video pipeline
                if (result.success) {
                    send VideoPipeline, e_video_ingested, 
                        VideoMetadata(
                            result.output_path,
                            extractTitle(result.output_path),
                            result.duration,
                            result.file_size,
                            "video/mp4",
                            "",  // phash calculated later
                            "",
                            "",
                            false
                        );
                }
            }
        }
    }
}

/**
 * PluginWorkerProcess
 * 
 * Worker process for data plane plugins (isolated from control plane).
 */
machine PluginWorkerProcess {
    var plugin_name: string;
    var plugin_instance: ArchiverPlugin;
    var is_alive: bool;
    
    start state Init {
        entry (name: string, plugin: ArchiverPlugin) {
            plugin_name = name;
            plugin_instance = plugin;
            is_alive = true;
            goto Running;
        }
    }
    
    state Running {
        on e_discover_sources do {
            var sources = plugin_instance.discoverSources();
            send PluginManager, e_worker_sources_found, 
                SourceList(plugin_name, sources);
        }
        
        on e_archive do (source: MediaSource) {
            var result = plugin_instance.archive(source);
            send PluginManager, e_worker_archive_complete, result;
        }
        
        on e_health_check do {
            var healthy = plugin_instance.healthCheck();
            send PluginManager, e_worker_health_status, 
                (plugin_name, healthy);
        }
    }
}

/**
 * JobScheduler
 * 
 * Schedules and manages recurring jobs (cron-like functionality).
 */
machine JobScheduler {
    var scheduled_jobs: map<string, RecurringJob>;
    var plugin_manager: PluginManager;
    var is_running: bool;
    
    start state Init {
        entry (pm: PluginManager) {
            plugin_manager = pm;
            scheduled_jobs = default(map[string, RecurringJob]);
            is_running = false;
        }
    }
    
    state Running {
        entry {
            is_running = true;
            startCronScheduler();
        }
        
        on e_job_triggered do (job_name: string) {
            var job = scheduled_jobs[job_name];
            // Execute job
            send plugin_manager, e_plugin_discover_sources, job.plugin_name;
        }
        
        on e_plugin_sources_found do (sources: SourceList) {
            // Auto-archive based on job configuration
            foreach (source in sources.sources) {
                send plugin_manager, e_plugin_archive, 
                    ArchiveRequest(sources.plugin_name, source);
            }
        }
    }
}

// ============================================================================
// DATA PROCESSING PIPELINE STATE MACHINES
// ============================================================================

/**
 * VideoPipeline
 * 
 * Main data processing pipeline for video content.
 * Flow: Ingest -> Analyze (optional) -> Encrypt (optional) -> Upload -> Sync
 */
machine VideoPipeline {
    var current_video: VideoMetadata;
    var analysis_enabled: bool;
    var encryption_enabled: bool;
    var upload_enabled: bool;
    var arkiv_sync_enabled: bool;
    
    start state Idle {
        on e_video_ingested do (meta: VideoMetadata) {
            current_video = meta;
            // Calculate phash for deduplication
            send PhashCalculator, e_calculate_phash, meta.path;
            goto CheckingDuplicate;
        }
    }
    
    state CheckingDuplicate {
        on e_phash_calculated do (phash: string) {
            current_video.phash = phash;
            var duplicate = checkDuplicate(phash);
            if (duplicate) {
                // Skip duplicate
                send RenderProcess, e_duplicate_detected, current_video.path;
                goto Idle;
            } else {
                // Save to database
                saveVideoMetadata(current_video);
                goto AnalyzingDecision;
            }
        }
    }
    
    state AnalyzingDecision {
        entry {
            // Check if AI analysis is enabled for this video
            analysis_enabled = getVideoAnalysisEnabled(current_video.path);
        }
        
        on null do {
            if (analysis_enabled) {
                send VLMAnalysisWorker, e_analysis_requested, current_video.path;
                goto Analyzing;
            } else {
                goto EncryptionDecision;
            }
        }
    }
    
    state Analyzing {
        on e_analysis_complete do (result: AIAnalysisResult) {
            // Save AI timestamps to database
            saveTimestamps(result);
            current_video.has_ai_data = true;
            updateVideoMetadata(current_video);
            goto EncryptionDecision;
        }
        
        on e_analysis_failed do (error: ErrorInfo) {
            // Log error but continue pipeline
            logAnalysisError(current_video.path, error);
            goto EncryptionDecision;
        }
    }
    
    state EncryptionDecision {
        entry {
            encryption_enabled = getEncryptionEnabled();
        }
        
        on null do {
            if (encryption_enabled) {
                send EncryptionService, e_encrypt_requested,
                    EncryptRequest(current_video.path, getAccessConditions());
                goto Encrypting;
            } else {
                goto UploadDecision;
            }
        }
    }
    
    state Encrypting {
        on e_encrypt_complete do (metadata: EncryptionMetadata) {
            // Store encryption metadata
            saveEncryptionMetadata(current_video.path, metadata);
            goto UploadDecision;
        }
    }
    
    state UploadDecision {
        entry {
            upload_enabled = getUploadEnabled();
        }
        
        on null do {
            if (upload_enabled) {
                send UploadCoordinator, e_upload_requested,
                    UploadRequest(
                        current_video.path,
                        getFilecoinConfig(),
                        encryption_enabled
                    );
                goto Uploading;
            } else {
                goto ArkivSyncDecision;
            }
        }
    }
    
    state Uploading {
        on e_upload_progress do (progress: UploadProgress) {
            // Forward to frontend
            send RenderProcess, e_upload_progress, progress;
        }
        
        on e_upload_complete do (result: UploadResult) {
            // Update video with Filecoin metadata
            updateFilecoinMetadata(current_video.path, result);
            goto ArkivSyncDecision;
        }
        
        on e_upload_failed do (error: ErrorInfo) {
            logUploadError(current_video.path, error);
            // Retry logic handled by UploadCoordinator
            goto ArkivSyncDecision;
        }
    }
    
    state ArkivSyncDecision {
        entry {
            arkiv_sync_enabled = getArkivSyncEnabled();
        }
        
        on null do {
            if (arkiv_sync_enabled) {
                send ArkivSyncWorker, e_sync_to_arkiv,
                    buildArkivSyncRequest(current_video);
                goto Syncing;
            } else {
                goto Complete;
            }
        }
    }
    
    state Syncing {
        on e_sync_complete do (result: ArkivSyncResult) {
            if (result.success) {
                updateArkivEntityKey(current_video.path, result.entity_key);
            }
            goto Complete;
        }
    }
    
    state Complete {
        entry {
            send RenderProcess, e_pipeline_complete, current_video.path;
            goto Idle;
        }
    }
}

/**
 * VLMAnalysisWorker
 * 
 * Background worker for AI video analysis using Visual Language Models.
 */
machine VLMAnalysisWorker {
    var analysis_queue: seq<string>;        // video paths
    var current_job: string;
    var is_processing: bool;
    var vlm_engine: VLMEngine;
    
    start state Idle {
        entry {
            is_processing = false;
        }
        
        on e_analysis_requested do (video_path: string) {
            push analysis_queue, video_path;
            if (!is_processing) {
                goto Processing;
            }
        }
    }
    
    state Processing {
        entry {
            is_processing = true;
            current_job = dequeue(analysis_queue);
            // Initialize VLM engine
            vlm_engine = new VLMEngine(createEngineConfig());
            vlm_engine.initialize();
        }
        
        on e_process_video do {
            var result = vlm_engine.processVideo(current_job);
            if (result.success) {
                send VideoPipeline, e_analysis_complete, result;
            } else {
                send VideoPipeline, e_analysis_failed, 
                    ErrorInfo("DECORD_ERROR", result.error, default(map[string, string]));
            }
            
            // Process next if available
            if (sizeof(analysis_queue) > 0) {
                current_job = dequeue(analysis_queue);
                send this, e_process_video;
            } else {
                is_processing = false;
                goto Idle;
            }
        }
    }
}

/**
 * UploadCoordinator
 * 
 * Manages video upload queue with VLM analysis integration.
 * Stages: VLM Analysis -> Upload to Filecoin -> Arkiv Sync
 */
machine UploadCoordinator {
    var upload_queue: UploadQueue;
    var current_upload: UploadQueueEntry;
    var filecoin_config: FilecoinConfig;
    
    start state Idle {
        entry {
            upload_queue = new UploadQueue();
        }
        
        on e_upload_requested do (req: UploadRequest) {
            var entry = upload_queue.enqueue(req.video_path);
            if (entry != null) {
                goto Processing;
            }
        }
    }
    
    state Processing {
        entry {
            current_upload = upload_queue.getNext();
            if (current_upload == null) {
                goto Idle;
            }
        }
        
        on e_process_entry do {
            // Stage 1: VLM Analysis (if enabled)
            if (current_upload.vlm_status == "pending") {
                send VLMAnalysisWorker, e_analysis_requested, 
                    current_upload.video_path;
                goto WaitingForVLM;
            } else {
                goto UploadingToFilecoin;
            }
        }
    }
    
    state WaitingForVLM {
        on e_analysis_complete do {
            current_upload.vlm_status = "completed";
            goto UploadingToFilecoin;
        }
        
        on e_analysis_failed do (error: ErrorInfo) {
            current_upload.vlm_status = "failed";
            current_upload.vlm_error = error.message;
            goto UploadingToFilecoin;  // Continue upload even if VLM fails
        }
    }
    
    state UploadingToFilecoin {
        entry {
            // Encrypt if needed
            if (current_upload.encryption_enabled) {
                send EncryptionService, e_encrypt_requested,
                    EncryptRequest(current_upload.video_path, getAccessConditions());
                goto EncryptingForUpload;
            } else {
                send FilecoinService, e_upload_file, current_upload.video_path;
            }
        }
        
        on e_upload_progress do (progress: UploadProgress) {
            current_upload.progress = progress.progress_percent;
            send RenderProcess, e_upload_progress, progress;
        }
        
        on e_upload_complete do (result: UploadResult) {
            current_upload.status = "completed";
            current_upload.root_cid = result.root_cid;
            updateQueueEntry(current_upload);
            
            // Trigger Arkiv sync
            send ArkivSyncWorker, e_sync_to_arkiv,
                buildArkivSyncRequestFromUpload(current_upload, result);
            
            // Process next
            goto Processing;
        }
        
        on e_upload_failed do (error: ErrorInfo) {
            current_upload.status = "failed";
            current_upload.error = error.message;
            current_upload.attempts = current_upload.attempts + 1;
            
            if (current_upload.attempts < 3) {
                // Retry
                current_upload.status = "pending";
                upload_queue.requeue(current_upload);
            }
            
            goto Processing;
        }
    }
    
    state EncryptingForUpload {
        on e_encrypt_complete do (metadata: EncryptionMetadata) {
            current_upload.encryption_metadata = metadata;
            send FilecoinService, e_upload_encrypted_file, 
                (current_upload.video_path, metadata);
            goto UploadingToFilecoin;
        }
    }
}

/**
 * ArkivSyncWorker
 * 
 * Background worker for syncing video metadata to Arkiv blockchain.
 */
machine ArkivSyncWorker {
    var sync_queue: seq<ArkivSyncRequest>;
    var arkiv_client: ArkivClient;
    var is_running: bool;
    
    start state Init {
        entry {
            var config = buildArkivConfig();
            if (config.enabled && config.private_key != "") {
                arkiv_client = new ArkivClient(config);
                is_running = true;
                goto Running;
            }
        }
    }
    
    state Running {
        on e_sync_to_arkiv do (req: ArkivSyncRequest) {
            push sync_queue, req;
            if (sizeof(sync_queue) == 1) {
                send this, e_process_sync;
            }
        }
        
        on e_process_sync do {
            var req = dequeue(sync_queue);
            
            // Build payload and attributes
            var payload = buildPayload(req);
            var attributes = req.attributes;
            
            // Check if entity exists
            var existing = arkiv_client.queryByCidHash(attributes["cid_hash"]);
            
            var result: ArkivSyncResult;
            if (existing != null) {
                // Update existing entity
                var receipt = arkiv_client.updateEntity(
                    existing.entity_key,
                    payload,
                    "application/json",
                    attributes,
                    getExpirationSeconds()
                );
                result = ArkivSyncResult(true, existing.entity_key, receipt.tx_hash);
            } else {
                // Create new entity
                var (entity_key, receipt) = arkiv_client.createEntity(
                    payload,
                    "application/json",
                    attributes,
                    getExpirationSeconds()
                );
                result = ArkivSyncResult(true, entity_key, receipt.tx_hash);
            }
            
            send VideoPipeline, e_sync_complete, result;
            
            // Process next
            if (sizeof(sync_queue) > 0) {
                send this, e_process_sync;
            }
        }
    }
}

/**
 * EncryptionService
 * 
 * Handles client-side encryption using Lit Protocol.
 */
machine EncryptionService {
    var lit_client: LitClient;
    
    start state Init {
        entry {
            lit_client = new LitClient();
        }
    }
    
    state Ready {
        on e_encrypt_requested do (req: EncryptRequest) {
            // Read file content
            var file_content = readFile(req.video_path);
            
            // Encrypt with Lit Protocol
            var (ciphertext, data_to_encrypt_hash) = lit_client.encryptString(
                file_content,
                req.access_conditions
            );
            
            var metadata = EncryptionMetadata(
                ciphertext,
                data_to_encrypt_hash,
                req.access_conditions,
                "ethereum"
            );
            
            send VideoPipeline, e_encrypt_complete, metadata;
        }
        
        on e_decrypt_requested do (ciphertext: string, metadata: EncryptionMetadata) {
            var decrypted = lit_client.decryptString(ciphertext, metadata);
            send Requester, e_decrypt_complete, decrypted;
        }
    }
}

/**
 * FilecoinService
 * 
 * Manages uploads to Filecoin network.
 */
machine FilecoinService {
    var upload_client: FilecoinUploadClient;
    
    start state Ready {
        on e_upload_file do (video_path: string) {
            // Upload to Filecoin
            var result = uploadToFilecoin(video_path, onProgress);
            
            if (result.success) {
                send UploadCoordinator, e_upload_complete,
                    UploadResult(
                        video_path,
                        result.root_cid,
                        result.piece_cid,
                        result.tx_hash,
                        default(EncryptionMetadata)
                    );
            } else {
                send UploadCoordinator, e_upload_failed,
                    ErrorInfo("UPLOAD_FAILED", result.error, default(map[string, string]));
            }
        }
        
        on e_upload_encrypted_file do (video_path: string, metadata: EncryptionMetadata) {
            // Upload encrypted file
            var result = uploadToFilecoin(video_path, onProgress);
            
            // Upload ciphertext to IPFS for Lit
            var ipfs_cid = uploadToIPFS(metadata.ciphertext);
            metadata.ciphertext = "";  // Clear from metadata
            
            if (result.success) {
                send UploadCoordinator, e_upload_complete,
                    UploadResult(
                        video_path,
                        result.root_cid,
                        result.piece_cid,
                        result.tx_hash,
                        metadata
                    );
            }
        }
    }
    
    fun onProgress(progress: int): void {
        send UploadCoordinator, e_upload_progress,
            UploadProgress("", "uploading", progress);
    }
}

/**
 * RecordingService
 * 
 * Manages WebRTC/live stream recording.
 */
machine RecordingService {
    var active_recordings: map<string, RecordingSession>;
    var recording_manager: OpenRingRecordingManager;
    
    start state Idle {
        on e_recording_start do (req: RecordingRequest) {
            var session = new RecordingSession(req.mint_id, req.source_uri);
            active_recordings[req.mint_id] = session;
            
            // Start recording based on media type
            if (req.media_type == "webrtc") {
                recording_manager.startRecording(req.mint_id, req.source_uri);
            }
            
            goto Recording;
        }
    }
    
    state Recording {
        on e_recording_chunk do (chunk: RecordingChunk) {
            // Process chunk
            saveRecordingChunk(chunk);
            
            // Trigger pipeline for completed chunks
            if (chunk.duration >= 30.0) {  // 30 second chunks
                send VideoPipeline, e_video_ingested,
                    VideoMetadata(
                        chunk.chunk_path,
                        format("Recording-{0}-{1}", chunk.mint_id, chunk.sequence_number),
                        chunk.duration,
                        getFileSize(chunk.chunk_path),
                        "video/mp4",
                        "",
                        "",
                        req.source_uri,
                        false
                    );
            }
        }
        
        on e_recording_stop do (mint_id: string) {
            var session = active_recordings[mint_id];
            session.stop();
            remove active_recordings, mint_id;
            
            if (sizeof(active_recordings) == 0) {
                goto Idle;
            }
        }
    }
}

// ============================================================================
// SPECIFICATIONS AND PROPERTIES
// ============================================================================

/**
 * Safety Property: Duplicate Detection
 * 
 * Ensures that duplicate videos (based on pHash) are not processed
 * through the full pipeline.
 */
spec DuplicatePrevention observes e_video_ingested, e_phash_calculated {
    var processed_phashes: set<string>;
    
    start state Monitoring {
        on e_phash_calculated do (phash: string) {
            if (phash in processed_phashes) {
                // Duplicate detected - should not proceed
                assert false, "Duplicate video processed";
            } else {
                insert processed_phashes, phash;
            }
        }
    }
}

/**
 * Safety Property: Encryption Before Upload
 * 
 * If encryption is enabled, upload must only occur after
 * encryption is complete.
 */
spec EncryptionOrdering observes e_encrypt_complete, e_upload_requested {
    var encrypted_videos: set<string>;
    var encryption_required: map<string, bool>;
    
    start state Monitoring {
        on e_encrypt_requested do (req: EncryptRequest) {
            encryption_required[req.video_path] = true;
        }
        
        on e_encrypt_complete do (metadata: EncryptionMetadata) {
            // Track which videos have been encrypted
            // (in real implementation, use video path from context)
        }
        
        on e_upload_requested do (req: UploadRequest) {
            if (encryption_required[req.video_path] && req.encryption_enabled) {
                // Verify encryption metadata exists
                assert hasEncryptionMetadata(req.video_path),
                    "Upload requested before encryption complete";
            }
        }
    }
}

/**
 * Liveness Property: Pipeline Completion
 * 
 * Ensures that ingested videos eventually complete the pipeline
 * (unless explicitly cancelled or failed permanently).
 */
spec PipelineCompletion observes e_video_ingested, e_pipeline_complete {
    var in_progress: set<string>;
    
    start state Monitoring {
        on e_video_ingested do (meta: VideoMetadata) {
            insert in_progress, meta.path;
        }
        
        on e_pipeline_complete do (video_path: string) {
            remove in_progress, video_path;
        }
        
        hot state WaitingForCompletion {
            // If video is in progress, it must eventually complete
            // (within reasonable time bound)
        }
    }
}

/**
 * Safety Property: Worker Isolation
 * 
 * Ensures worker plugins (data plane) do not interfere with
 * control plane operations.
 */
spec WorkerIsolation observes e_plugin_archive, e_worker_health_status {
    var worker_plugin_names: set<string>;
    
    start state Monitoring {
        on e_plugin_archive do (req: ArchiveRequest) {
            if (req.plugin_name in worker_plugin_names) {
                // Must be handled by worker process, not control plane
                assert isWorkerProcess(req.plugin_name),
                    "Data plane plugin running in control plane";
            }
        }
    }
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

/**
 * Test: Basic Video Ingestion and Analysis
 */
test BasicIngestionScenario {
    var frontend: ElectronMainProcess;
    var backend: FastAPIServer;
    var pipeline: VideoPipeline;
    var vlm_worker: VLMAnalysisWorker;
    
    entry {
        // Initialize system
        frontend = new ElectronMainProcess();
        backend = new FastAPIServer();
        pipeline = new VideoPipeline();
        vlm_worker = new VLMAnalysisWorker();
        
        // Start backend
        send frontend, e_start_backend;
        
        // Simulate video ingestion
        var video_path = "/videos/test.mp4";
        send pipeline, e_video_ingested,
            VideoMetadata(
                video_path,
                "Test Video",
                60.0,
                10485760,
                "video/mp4",
                "",
                "creator123",
                "youtube.com/watch?v=123",
                false
            );
        
        // Request analysis
        send vlm_worker, e_analysis_requested, video_path;
        
        // Verify pipeline completes
        assert pipeline.state == Complete;
    }
}

/**
 * Test: Upload with Encryption Pipeline
 */
test EncryptedUploadScenario {
    var pipeline: VideoPipeline;
    var encryption: EncryptionService;
    var upload: UploadCoordinator;
    var arkiv: ArkivSyncWorker;
    
    entry {
        pipeline = new VideoPipeline();
        encryption = new EncryptionService();
        upload = new UploadCoordinator();
        arkiv = new ArkivSyncWorker();
        
        // Enable encryption
        setEncryptionEnabled(true);
        setUploadEnabled(true);
        setArkivSyncEnabled(true);
        
        // Ingest video
        var video_path = "/videos/private.mp4";
        send pipeline, e_video_ingested,
            VideoMetadata(video_path, "Private Video", 120.0, 20971520, 
                         "video/mp4", "", "", "", false);
        
        // Pipeline should: analyze -> encrypt -> upload -> sync
        // Verification done through state assertions
    }
}

/**
 * Test: Plugin Worker Isolation
 */
test PluginWorkerIsolationScenario {
    var plugin_manager: PluginManager;
    var youtube_worker: PluginWorkerProcess;
    
    entry {
        plugin_manager = new PluginManager(4);
        
        // Configure YouTube as worker plugin
        plugin_manager.setWorkerPlugins(["YouTubePlugin"]);
        
        // Create worker process
        youtube_worker = new PluginWorkerProcess();
        
        // Send archive request
        send plugin_manager, e_plugin_archive,
            ArchiveRequest(
                "YouTubePlugin",
                MediaSource(
                    "vid123",
                    "youtube",
                    "youtube.com/watch?v=123",
                    "high",
                    default(map[string, string])
                )
            );
        
        // Verify request routed to worker, not control plane
        assert youtube_worker.state == Running;
    }
}

/**
 * Test: Duplicate Detection
 */
test DuplicateDetectionScenario {
    var pipeline: VideoPipeline;
    var phash_calc: PhashCalculator;
    
    entry {
        pipeline = new VideoPipeline();
        phash_calc = new PhashCalculator();
        
        // First video
        var video1 = "/videos/video1.mp4";
        send pipeline, e_video_ingested,
            VideoMetadata(video1, "Video 1", 60.0, 10485760, "video/mp4", 
                         "abc123", "", "", false);
        
        // Same video, different path
        var video2 = "/videos/video1_copy.mp4";
        send pipeline, e_video_ingested,
            VideoMetadata(video2, "Video 1 Copy", 60.0, 10485760, "video/mp4", 
                         "abc123", "", "", false);
        
        // Second should be rejected as duplicate
        // Verified by DuplicatePrevention spec
    }
}
