# Sprint 3: Pipeline Implementation

## Sprint Goal
Complete all pipeline step implementations so that videos can be processed end-to-end: ingested, analyzed, encrypted, uploaded, and synced to blockchain.

## Duration
2 weeks

## Dependencies
- Sprint 1: Database, metadata extraction, pHash
- Sprint 2: JS Services (Lit Protocol, Synapse)

## Sprint Deliverables
1. Complete ingest step with database persistence
2. VLM analysis integration
3. Lit Protocol encryption step
4. Filecoin upload step
5. Arkiv blockchain sync step
6. Daemon mode for continuous processing

## Definition of Done
- `haven upload <file>` processes file through complete pipeline
- VLM analysis generates timestamps and tags
- Encryption works with configurable access conditions
- Files uploaded to Filecoin with valid CID
- Metadata synced to Arkiv blockchain
- `haven run` starts daemon mode
- Integration tests for full pipeline
- Code reviewed and merged to main branch

## Tasks in This Sprint
1. `task-01-ingest-step-completion.md` - Complete Ingest Step (Backend Dev)
2. `task-02-vlm-analysis-integration.md` - VLM Analysis Integration (AI Dev)
3. `task-03-encrypt-step-completion.md` - Encryption Pipeline Step (Backend Dev)
4. `task-04-upload-step-completion.md` - Upload Pipeline Step (Backend Dev)
5. `task-05-sync-step-arkiv.md` - Arkiv Sync Step (Web3 Dev)
6. `task-06-daemon-mode.md` - Daemon Mode Implementation (Backend Dev)
