# Haven CLI Sprint Plan

This document outlines the development sprints required to complete the Haven CLI from its current skeleton state to a fully functional application.

## Overview

| Sprint | Duration | Focus | Tasks |
|--------|----------|-------|-------|
| Sprint 1 | 2 weeks | Foundation & Core Infrastructure | 4 |
| Sprint 2 | 2 weeks | JS Services Integration | 4 |
| Sprint 3 | 2 weeks | Pipeline Implementation | 6 |
| Sprint 4 | 2 weeks | Scheduler & Job System | 4 |
| Sprint 5 | 2 weeks | Plugins & CLI Polish | 4 |

**Total Duration**: 10 weeks (with parallel work possible)

## Sprint Dependencies

```
Sprint 1 (Foundation)
    │
    ├──► Sprint 2 (JS Services)
    │         │
    │         └──► Sprint 3 (Pipeline) ──► Sprint 4 (Scheduler)
    │                                            │
    └────────────────────────────────────────────┴──► Sprint 5 (Polish)
```

## Sprint Summaries

### Sprint 1: Foundation & Core Infrastructure
**Goal**: Establish foundational infrastructure required by all other components.

| Task | Assignee | Priority | Effort |
|------|----------|----------|--------|
| Database Infrastructure Setup | Backend Dev | Critical | 3 days |
| Configuration System Enhancement | Backend Dev | High | 2 days |
| Video Metadata Extraction | Media Dev | High | 2 days |
| Perceptual Hash Implementation | Media Dev | High | 2 days |

**Key Deliverables**:
- SQLite database with schema
- Configuration file persistence
- Video metadata extraction (ffprobe)
- pHash calculation for deduplication

---

### Sprint 2: JS Services Integration
**Goal**: Complete JavaScript runtime integration for browser-dependent SDKs.

| Task | Assignee | Priority | Effort |
|------|----------|----------|--------|
| Lit Protocol SDK Integration | Web3 Dev | Critical | 4 days |
| Synapse SDK / Filecoin Integration | Web3 Dev | Critical | 4 days |
| JS Runtime Bridge Hardening | Backend Dev | High | 3 days |
| Download from Filecoin Implementation | Backend Dev | High | 2 days |

**Key Deliverables**:
- Working Lit Protocol encryption/decryption
- Filecoin upload via Synapse
- Reliable JS Runtime Bridge
- Download functionality

---

### Sprint 3: Pipeline Implementation
**Goal**: Complete all pipeline steps for end-to-end video processing.

| Task | Assignee | Priority | Effort |
|------|----------|----------|--------|
| Complete Ingest Step | Backend Dev | Critical | 2 days |
| VLM Analysis Integration | AI Dev | High | 4 days |
| Encryption Pipeline Step | Backend Dev | High | 2 days |
| Upload Pipeline Step | Backend Dev | Critical | 2 days |
| Arkiv Blockchain Sync Step | Web3 Dev | High | 3 days |
| Daemon Mode Implementation | Backend Dev | High | 3 days |

**Key Deliverables**:
- Complete ingest with database persistence
- VLM-powered video analysis
- Lit Protocol encryption step
- Filecoin upload step
- Arkiv blockchain sync
- `haven run` daemon mode

---

### Sprint 4: Scheduler & Job System
**Goal**: Complete job scheduler for automated content discovery and archival.

| Task | Assignee | Priority | Effort |
|------|----------|----------|--------|
| APScheduler Integration | Backend Dev | Critical | 3 days |
| Job CLI Commands | Backend Dev | High | 2 days |
| Job Executor Implementation | Backend Dev | High | 3 days |
| Job State Persistence | Backend Dev | High | 2 days |

**Key Deliverables**:
- Cron-based job scheduling
- Job CRUD via CLI
- Plugin-based job execution
- Persistent job state

---

### Sprint 5: Plugins & CLI Polish
**Goal**: Complete plugin system and polish CLI for production.

| Task | Assignee | Priority | Effort |
|------|----------|----------|--------|
| YouTube Archiver Plugin | Plugin Dev | Critical | 4 days |
| Plugin CLI Commands | Backend Dev | High | 2 days |
| CLI Error Handling & UX | Backend Dev | High | 2 days |
| Documentation & Help Text | Tech Writer | Medium | 3 days |

**Key Deliverables**:
- Working YouTube plugin
- Plugin management CLI
- Consistent error handling
- Comprehensive documentation

---

## Team Roles

| Role | Responsibilities |
|------|------------------|
| **Backend Dev** | Python CLI, pipeline, scheduler, database |
| **Web3 Dev** | Lit Protocol, Synapse, Arkiv integration |
| **Media Dev** | Video processing, ffmpeg, pHash |
| **AI Dev** | VLM integration, analysis pipeline |
| **Plugin Dev** | Plugin implementations (YouTube, etc.) |
| **Tech Writer** | Documentation, help text |

## Definition of Done (All Sprints)

- [ ] All acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Integration tests passing
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] No critical bugs
- [ ] Merged to main branch

## Code Reuse from Electron App

The existing Haven Player electron app (`backend/` and `frontend/` directories) contains **production-tested implementations** that can be directly ported to the CLI. This significantly reduces development effort.

### High Reuse Components (85-95% portable)

| Component | Source File | Reuse Level | Notes |
|-----------|-------------|-------------|-------|
| **Database Models** | `backend/app/models/video.py` | 95% | Video, Timestamp models - direct port |
| **Database Connection** | `backend/app/models/database.py` | 95% | SQLAlchemy setup - change path only |
| **RecurringJob Model** | `backend/app/models/recurring_job.py` | 95% | Job model - direct port |
| **pHash Calculator** | `backend/app/utils/phash/phash_calculator.py` | 85% | Complete implementation |
| **Job Scheduler** | `backend/app/services/job_scheduler.py` | 90% | APScheduler integration |
| **Arkiv Sync** | `backend/app/services/arkiv_sync.py` | 90% | Uses Python SDK directly |
| **VLM Processor** | `backend/app/services/vlm_processor.py` | 85% | Uses vlm_engine package |
| **YouTube Plugin** | `backend/app/plugins/builtin/youtube_plugin.py` | 85% | Complete plugin |
| **Plugin Interface** | `backend/app/plugins/plugin_interface.py` | 95% | Base classes |

### Medium Reuse Components (65-80% portable)

| Component | Source File | Reuse Level | Notes |
|-----------|-------------|-------------|-------|
| **Lit Protocol** | `frontend/src/services/litService.ts` | 70% | TypeScript → Deno adaptation |
| **Hybrid Crypto** | `frontend/src/services/hybridCrypto.ts` | 75% | Core crypto logic portable |
| **Filecoin Upload** | `frontend/src/services/filecoinService.ts` | 65% | Uses filecoin-pin package |

### Key Insights

1. **Arkiv uses Python SDK** - No JS bridge needed! The electron app uses `arkiv` Python package directly.
2. **VLM uses external package** - The `vlm_engine` package handles all VLM complexity.
3. **APScheduler is production-tested** - Complete scheduler with SQLAlchemy jobstore.
4. **YouTube plugin is comprehensive** - ~800 lines with retry logic, JS runtime detection, cookie support.

### Recommended Port Order

1. **Sprint 1**: Port database models first (foundation for everything)
2. **Sprint 2**: Port Lit/Filecoin services (adapt TypeScript to Deno)
3. **Sprint 3**: Port VLM processor and Arkiv sync (Python direct)
4. **Sprint 4**: Port job scheduler (nearly direct copy)
5. **Sprint 5**: Port YouTube plugin (adapt for CLI)

### Files to Copy Directly

```bash
# Database (Sprint 1)
backend/app/models/base.py → haven_cli/database/models.py
backend/app/models/video.py → haven_cli/database/models.py (append)
backend/app/models/recurring_job.py → haven_cli/database/models.py (append)

# pHash (Sprint 1)
backend/app/utils/phash/phash_calculator.py → haven_cli/media/phash.py

# Scheduler (Sprint 4)
backend/app/services/job_scheduler.py → haven_cli/scheduler/job_scheduler.py

# Arkiv (Sprint 3)
backend/app/services/arkiv_sync.py → haven_cli/services/arkiv_sync.py
backend/app/services/evm_utils.py → haven_cli/services/evm_utils.py

# VLM (Sprint 3)
backend/app/services/vlm_processor.py → haven_cli/vlm/processor.py
backend/app/services/vlm_config.py → haven_cli/vlm/config.py

# Plugins (Sprint 5)
backend/app/plugins/plugin_interface.py → haven_cli/plugins/base.py
backend/app/plugins/builtin/youtube_plugin.py → haven_cli/plugins/builtin/youtube.py
```

---

## Risk Factors

1. **External Dependencies**: Lit Protocol, Synapse, Arkiv APIs may change
2. **VLM Costs**: GPT-4V API costs for analysis
3. **Network Reliability**: Filecoin deal confirmation times
4. **Browser SDK Compatibility**: Deno compatibility with npm packages

## Getting Started

1. Review the sprint overview for your assigned sprint
2. Read the task file for detailed requirements
3. Check dependencies to ensure prerequisites are complete
4. Create a feature branch from main
5. Implement according to acceptance criteria
6. Submit PR for review

## File Structure

```
sprints/
├── README.md                          # This file
├── sprint-1-foundation/
│   ├── SPRINT_OVERVIEW.md
│   ├── task-01-database-setup.md
│   ├── task-02-config-persistence.md
│   ├── task-03-video-metadata.md
│   └── task-04-phash-implementation.md
├── sprint-2-js-services/
│   ├── SPRINT_OVERVIEW.md
│   ├── task-01-lit-protocol-integration.md
│   ├── task-02-synapse-sdk-integration.md
│   ├── task-03-js-bridge-improvements.md
│   └── task-04-download-implementation.md
├── sprint-3-pipeline/
│   ├── SPRINT_OVERVIEW.md
│   ├── task-01-ingest-step-completion.md
│   ├── task-02-vlm-analysis-integration.md
│   ├── task-03-encrypt-step-completion.md
│   ├── task-04-upload-step-completion.md
│   ├── task-05-sync-step-arkiv.md
│   └── task-06-daemon-mode.md
├── sprint-4-scheduler/
│   ├── SPRINT_OVERVIEW.md
│   ├── task-01-apscheduler-integration.md
│   ├── task-02-job-crud-commands.md
│   ├── task-03-job-executor-completion.md
│   └── task-04-job-persistence.md
└── sprint-5-plugins-cli/
    ├── SPRINT_OVERVIEW.md
    ├── task-01-youtube-plugin.md
    ├── task-02-plugin-cli-commands.md
    ├── task-03-cli-error-handling.md
    └── task-04-documentation.md
```

## Contact

For questions about sprint planning, contact the Scrum Master.
