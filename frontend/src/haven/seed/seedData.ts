import type { IsoDateTime } from "@/haven/model/enums";
import type { HavenState } from "@/haven/model/types";
import {
  asAnchorId,
  asArtifactId,
  asCollectionId,
  asCommentId,
  asDiscussionThreadId,
  asGovernanceProposalId,
  asHubId,
  asModerationCaseId,
  asOperatorId,
  asPipelineJobId,
  asTagId,
  asThreadId,
  asUserId,
  asVersionId,
} from "@/haven/model/ids";

function iso(s: string): IsoDateTime {
  return s;
}

export function createSeedState(): HavenState {
  const userAlice = asUserId("user_alice");
  const userBen = asUserId("user_ben");
  const userCleo = asUserId("user_cleo");

  const hubArchive = asHubId("hub_archive");
  const hubCreators = asHubId("hub_creators");

  const tagPolitics = asTagId("tag_politics");
  const tagMusic = asTagId("tag_music");
  const tagInvestigation = asTagId("tag_investigation");
  const tagClip = asTagId("tag_clip");

  const artifactA = asArtifactId("artifact_rally_stream");
  const artifactB = asArtifactId("artifact_indie_show");
  const artifactC = asArtifactId("artifact_research_talk");

  const threadA = asDiscussionThreadId("discuss_artifact_rally");
  const threadB = asDiscussionThreadId("discuss_artifact_show");
  const threadC = asDiscussionThreadId("discuss_artifact_talk");

  const collectionFeatured = asCollectionId("collection_featured");
  const collectionUrgent = asCollectionId("collection_urgent");
  const collectionHall = asCollectionId("collection_hall");

  const opNorth = asOperatorId("op_north");
  const opSouth = asOperatorId("op_south");

  const jobCaptureA = asPipelineJobId("job_capture_a");
  const jobAnalyzeA = asPipelineJobId("job_analyze_a");
  const jobArchiveA = asPipelineJobId("job_archive_a");

  const jobCaptureB = asPipelineJobId("job_capture_b");
  const jobAnalyzeB = asPipelineJobId("job_analyze_b");

  const comment1 = asCommentId("c1");
  const comment2 = asCommentId("c2");
  const comment3 = asCommentId("c3");

  const versionA1 = asVersionId("v_artifact_a_1");
  const versionA2 = asVersionId("v_artifact_a_2");

  const proposal1 = asGovernanceProposalId("gov_norms_1");
  const mod1 = asModerationCaseId("mod_case_1");

  const aTimeline1 = asAnchorId("anchor_timeline_a_1");
  const aComment1 = asAnchorId("anchor_comment_c1");
  const aProv1 = asAnchorId("anchor_prov_a_capture");

  const loomThread1 = asThreadId("loom_thread_discussion_1");
  const loomThread2 = asThreadId("loom_thread_link_1");

  const now = iso("2025-12-12T00:00:00.000Z");

  const state: HavenState = {
    entities: {
      tags: {
        [tagPolitics]: { id: tagPolitics, label: "Politics", color: "#4F8CFF" },
        [tagMusic]: { id: tagMusic, label: "Music", color: "#7C5CFF" },
        [tagInvestigation]: {
          id: tagInvestigation,
          label: "Investigation",
          color: "#2EC4B6",
        },
        [tagClip]: { id: tagClip, label: "Clip", color: "#FF9F1C" },
      },
      users: {
        [userAlice]: {
          id: userAlice,
          displayName: "Alice Archivist",
          handle: "alice",
          avatarSeed: "aa",
        },
        [userBen]: {
          id: userBen,
          displayName: "Ben Curator",
          handle: "ben",
          avatarSeed: "bb",
        },
        [userCleo]: {
          id: userCleo,
          displayName: "Cleo Moderator",
          handle: "cleo",
          avatarSeed: "cc",
        },
      },
      hubs: {
        [hubArchive]: {
          id: hubArchive,
          name: "Civic Archive",
          description: "A living record of public events, verified and contextualized.",
          normsMarkdown:
            "## Norms\n\n- Attribute creators\n- Prioritize context\n- Respect privacy by default",
          createdAt: iso("2025-10-01T12:00:00.000Z"),
          createdBy: userAlice,
          memberIds: [userAlice, userBen, userCleo],
          members: {
            [userAlice]: { userId: userAlice, role: "archivist", joinedAt: now },
            [userBen]: { userId: userBen, role: "curator", joinedAt: now },
            [userCleo]: { userId: userCleo, role: "moderator", joinedAt: now },
          },
          featuredCollectionIds: [collectionFeatured, collectionUrgent],
        },
        [hubCreators]: {
          id: hubCreators,
          name: "Creators Hall",
          description: "A studio + community hall for indie creators and remix culture.",
          normsMarkdown:
            "## Norms\n\n- Creator opt-in libraries\n- Safer-by-design sharing\n- Remix with attribution",
          createdAt: iso("2025-09-05T08:30:00.000Z"),
          createdBy: userBen,
          memberIds: [userBen, userCleo],
          members: {
            [userBen]: { userId: userBen, role: "curator", joinedAt: now },
            [userCleo]: { userId: userCleo, role: "moderator", joinedAt: now },
          },
          featuredCollectionIds: [collectionHall],
        },
      },
      collections: {
        [collectionFeatured]: {
          id: collectionFeatured,
          hubId: hubArchive,
          name: "Featured",
          description: "High-signal artifacts with strong provenance.",
          artifactIds: [artifactA, artifactC],
          pinned: true,
          createdAt: iso("2025-10-02T09:00:00.000Z"),
          createdBy: userAlice,
        },
        [collectionUrgent]: {
          id: collectionUrgent,
          hubId: hubArchive,
          name: "Needs Context",
          description: "Artifacts that need verification and curator notes.",
          artifactIds: [artifactA],
          pinned: false,
          createdAt: iso("2025-10-06T10:00:00.000Z"),
          createdBy: userBen,
        },
        [collectionHall]: {
          id: collectionHall,
          hubId: hubCreators,
          name: "Live Sets",
          description: "Indie performances and community captures.",
          artifactIds: [artifactB],
          pinned: true,
          createdAt: iso("2025-09-08T10:00:00.000Z"),
          createdBy: userBen,
        },
      },
      artifacts: {
        [artifactA]: {
          id: artifactA,
          hubId: hubArchive,
          title: "Rally Livestream — Downtown (Full Capture)",
          sourcePlatform: "LiveKit",
          sourceUrl: "https://example.invalid/livekit/rally",
          creatorAttribution: "Independent Streamer",
          accessPolicy: "hub_only",
          encryptedBeforeUpload: true,
          curatorNotesMarkdown:
            "### Curator notes\n\n- Needs additional viewpoint verification at ~09:04\n- Add context about the location and time",
          createdAt: iso("2025-11-01T18:00:00.000Z"),
          createdBy: userAlice,
          tags: [tagPolitics, tagInvestigation],
          analysis: {
            tags: [
              { tagId: tagPolitics, atSeconds: 112, label: "Crowd chant", confidence: 0.86 },
              { tagId: tagClip, atSeconds: 544, label: "Key exchange", confidence: 0.72 },
            ],
            summaries: [
              {
                startSeconds: 0,
                endSeconds: 300,
                summary: "Arrival and first speeches; early crowd movement.",
              },
              {
                startSeconds: 300,
                endSeconds: 900,
                summary: "Escalation and dispersal; multiple viewpoints mentioned.",
              },
            ],
          },
          integrity: {
            cid: "bafy...mockcidA",
            phash: "ff00aa11cc22dd33",
            dedupMatches: [{ artifactId: artifactC, similarity: 0.12 }],
            verifiedBy: [userCleo],
          },
          provenance: [
            {
              id: "prov_a_capture",
              stage: "capture",
              at: iso("2025-11-01T18:02:00.000Z"),
              actorUserId: userAlice,
              note: "Scheduled capture from LiveKit room; chunked every 30s.",
            },
            {
              id: "prov_a_analyze",
              stage: "analyze",
              at: iso("2025-11-01T19:10:00.000Z"),
              actorUserId: userBen,
              note: "VLM pass produced tags + timeline summaries.",
            },
            {
              id: "prov_a_archive",
              stage: "archive",
              at: iso("2025-11-02T10:00:00.000Z"),
              actorUserId: userAlice,
              note: "Archived to Filecoin (simulated deal); published Arkiv catalog.",
            },
          ],
          discussionThreadId: threadA,
          versions: [versionA1, versionA2],
        },
        [artifactB]: {
          id: artifactB,
          hubId: hubCreators,
          title: "Indie Show — Basement Set (Highlights)",
          sourcePlatform: "Upload",
          sourceUrl: "file:///local/mock/indie.mp4",
          creatorAttribution: "Basement Sessions",
          accessPolicy: "public",
          encryptedBeforeUpload: false,
          curatorNotesMarkdown:
            "### Curator notes\n\n- Confirm creator opt-in before broader sharing\n- Consider adding clip boundaries for the chorus",
          createdAt: iso("2025-10-20T21:00:00.000Z"),
          createdBy: userBen,
          tags: [tagMusic, tagClip],
          analysis: {
            tags: [{ tagId: tagMusic, atSeconds: 44, label: "Hook", confidence: 0.91 }],
            summaries: [
              {
                startSeconds: 0,
                endSeconds: 120,
                summary: "Opening track with a strong chorus; crowd call-and-response.",
              },
            ],
          },
          integrity: {
            cid: null,
            phash: "00aa11cc22dd33ee",
            dedupMatches: [],
            verifiedBy: [],
          },
          provenance: [
            {
              id: "prov_b_capture",
              stage: "capture",
              at: iso("2025-10-20T21:05:00.000Z"),
              actorUserId: userBen,
              note: "Manual ingest of uploaded highlight reel.",
            },
          ],
          discussionThreadId: threadB,
          versions: [],
        },
        [artifactC]: {
          id: artifactC,
          hubId: hubArchive,
          title: "Research Talk — Media Preservation (Lecture)",
          sourcePlatform: "WebRTC",
          sourceUrl: "https://example.invalid/webrtc/talk",
          creatorAttribution: "Public University",
          accessPolicy: "public",
          encryptedBeforeUpload: false,
          curatorNotesMarkdown:
            "### Curator notes\n\n- Candidate for hub onboarding / norms primer\n- Link to related artifacts as examples",
          createdAt: iso("2025-09-18T16:00:00.000Z"),
          createdBy: userAlice,
          tags: [tagInvestigation],
          analysis: { tags: [], summaries: [] },
          integrity: {
            cid: "bafy...mockcidC",
            phash: "aabbccddeeff0011",
            dedupMatches: [{ artifactId: artifactA, similarity: 0.12 }],
            verifiedBy: [userAlice, userBen],
          },
          provenance: [
            {
              id: "prov_c_capture",
              stage: "capture",
              at: iso("2025-09-18T16:01:00.000Z"),
              actorUserId: userAlice,
              note: "Captured from WebRTC source with operator assistance.",
            },
          ],
          discussionThreadId: threadC,
          versions: [],
        },
      },
      versions: {
        [versionA1]: {
          id: versionA1,
          artifactId: artifactA,
          createdAt: iso("2025-11-01T19:15:00.000Z"),
          createdBy: userBen,
          changeSummary: "Initial AI timeline + tags",
          snapshot: {
            title: "Rally Livestream — Downtown (Full Capture)",
            tags: [tagPolitics, tagInvestigation],
            analysis: {
              tags: [
                { tagId: tagPolitics, atSeconds: 112, label: "Crowd chant", confidence: 0.86 },
              ],
              summaries: [],
            },
            accessPolicy: "hub_only",
            encryptedBeforeUpload: true,
            provenance: [],
          },
        },
        [versionA2]: {
          id: versionA2,
          artifactId: artifactA,
          createdAt: iso("2025-11-02T10:05:00.000Z"),
          createdBy: userAlice,
          changeSummary: "Archive + Arkiv publish",
          snapshot: {
            title: "Rally Livestream — Downtown (Full Capture)",
            tags: [tagPolitics, tagInvestigation],
            analysis: { tags: [], summaries: [] },
            accessPolicy: "hub_only",
            encryptedBeforeUpload: true,
            provenance: [
              {
                id: "prov_a_archive",
                stage: "archive",
                at: iso("2025-11-02T10:00:00.000Z"),
                actorUserId: userAlice,
                note: "Archived to Filecoin (simulated deal); published Arkiv catalog.",
              },
            ],
          },
        },
      },
      discussionThreads: {
        [threadA]: { id: threadA, artifactId: artifactA, commentIds: [comment1, comment2] },
        [threadB]: { id: threadB, artifactId: artifactB, commentIds: [] },
        [threadC]: { id: threadC, artifactId: artifactC, commentIds: [comment3] },
      },
      comments: {
        [comment1]: {
          id: comment1,
          threadId: threadA,
          authorId: userCleo,
          createdAt: iso("2025-11-01T20:00:00.000Z"),
          updatedAt: null,
          bodyMarkdown: "Provenance looks good. We should add curator notes about camera angle at 09:04.",
          parentCommentId: null,
          artifactTimestampSeconds: 544,
        },
        [comment2]: {
          id: comment2,
          threadId: threadA,
          authorId: userBen,
          createdAt: iso("2025-11-01T20:10:00.000Z"),
          updatedAt: null,
          bodyMarkdown: "Added a thread linking the key exchange to the lecture on preservation ethics.",
          parentCommentId: comment1,
          artifactTimestampSeconds: null,
        },
        [comment3]: {
          id: comment3,
          threadId: threadC,
          authorId: userAlice,
          createdAt: iso("2025-09-18T18:00:00.000Z"),
          updatedAt: null,
          bodyMarkdown: "This talk frames *why* permanence matters. Great candidate for Hub onboarding.",
          parentCommentId: null,
          artifactTimestampSeconds: null,
        },
      },
      pipelineJobs: {
        [jobCaptureA]: {
          id: jobCaptureA,
          stage: "capture",
          status: "completed",
          createdAt: iso("2025-11-01T18:02:00.000Z"),
          updatedAt: iso("2025-11-01T18:40:00.000Z"),
          artifactId: artifactA,
          assignedOperatorId: opNorth,
          progressPercent: 100,
          lastMessage: "Capture completed; 90 chunks recorded.",
          retryCount: 0,
        },
        [jobAnalyzeA]: {
          id: jobAnalyzeA,
          stage: "analyze",
          status: "completed",
          createdAt: iso("2025-11-01T18:45:00.000Z"),
          updatedAt: iso("2025-11-01T19:12:00.000Z"),
          artifactId: artifactA,
          assignedOperatorId: null,
          progressPercent: 100,
          lastMessage: "Generated tags + timeline summaries.",
          retryCount: 1,
        },
        [jobArchiveA]: {
          id: jobArchiveA,
          stage: "archive",
          status: "running",
          createdAt: iso("2025-11-02T09:50:00.000Z"),
          updatedAt: iso("2025-11-02T09:55:00.000Z"),
          artifactId: artifactA,
          assignedOperatorId: opSouth,
          progressPercent: 62,
          lastMessage: "Negotiating storage deal (simulated).",
          retryCount: 0,
        },
        [jobCaptureB]: {
          id: jobCaptureB,
          stage: "capture",
          status: "completed",
          createdAt: iso("2025-10-20T21:05:00.000Z"),
          updatedAt: iso("2025-10-20T21:05:10.000Z"),
          artifactId: artifactB,
          assignedOperatorId: null,
          progressPercent: 100,
          lastMessage: "Upload ingested.",
          retryCount: 0,
        },
        [jobAnalyzeB]: {
          id: jobAnalyzeB,
          stage: "analyze",
          status: "queued",
          createdAt: iso("2025-10-20T21:06:00.000Z"),
          updatedAt: iso("2025-10-20T21:06:00.000Z"),
          artifactId: artifactB,
          assignedOperatorId: null,
          progressPercent: 0,
          lastMessage: "Awaiting analysis worker.",
          retryCount: 0,
        },
      },
      operators: {
        [opNorth]: {
          id: opNorth,
          displayName: "North Node",
          locationHint: "NYC",
          uptimePercent: 98.2,
          storageGbAvailable: 4200,
          pricePerJob: 1.25,
          reputationScore: 91,
        },
        [opSouth]: {
          id: opSouth,
          displayName: "South Node",
          locationHint: "ATL",
          uptimePercent: 95.4,
          storageGbAvailable: 1900,
          pricePerJob: 0.95,
          reputationScore: 84,
        },
      },
      reputations: {
        [userAlice]: {
          userId: userAlice,
          dimensions: {
            reliability: 92,
            quality: 81,
            cultural_contribution: 88,
            safety: 90,
          },
          evidence: [
            { at: iso("2025-11-02T10:05:00.000Z"), label: "Published Arkiv catalog", delta: 4 },
          ],
        },
        [userBen]: {
          userId: userBen,
          dimensions: {
            reliability: 78,
            quality: 90,
            cultural_contribution: 85,
            safety: 79,
          },
          evidence: [{ at: iso("2025-11-01T19:12:00.000Z"), label: "Curated AI output", delta: 3 }],
        },
        [userCleo]: {
          userId: userCleo,
          dimensions: {
            reliability: 86,
            quality: 74,
            cultural_contribution: 70,
            safety: 95,
          },
          evidence: [{ at: iso("2025-11-01T20:00:00.000Z"), label: "Verified provenance", delta: 5 }],
        },
      },
      governanceProposals: {
        [proposal1]: {
          id: proposal1,
          hubId: hubArchive,
          title: "Update Hub Norms: default hub-only access",
          descriptionMarkdown:
            "Proposal to make **hub-only** the default for newly captured artifacts, with an explicit opt-in to public.",
          status: "open",
          createdAt: iso("2025-11-03T10:00:00.000Z"),
          createdBy: userCleo,
          openFrom: iso("2025-11-03T10:00:00.000Z"),
          openUntil: iso("2025-11-10T10:00:00.000Z"),
          votes: [
            { voterId: userAlice, choice: "yes", weight: 10, castAt: iso("2025-11-03T10:30:00.000Z") },
            { voterId: userBen, choice: "abstain", weight: 5, castAt: iso("2025-11-03T11:00:00.000Z") },
          ],
        },
      },
      moderationCases: {
        [mod1]: {
          id: mod1,
          hubId: hubCreators,
          createdAt: iso("2025-10-21T09:00:00.000Z"),
          createdBy: userCleo,
          targetType: "comment",
          targetId: "c_external_1",
          reason: "Potential doxxing content; requires review.",
          status: "open",
          decidedAction: "none",
          decidedAt: null,
          decidedBy: null,
        },
      },
      anchors: {
        [aTimeline1]: {
          id: aTimeline1,
          kind: "artifact_timeline",
          label: "Key exchange @ 09:04",
          artifactId: artifactA,
          hubId: hubArchive,
          collectionId: null,
          commentId: null,
          provenanceStepId: null,
        },
        [aComment1]: {
          id: aComment1,
          kind: "comment",
          label: "Comment: provenance looks good",
          artifactId: artifactA,
          hubId: hubArchive,
          collectionId: null,
          commentId: comment1,
          provenanceStepId: null,
        },
        [aProv1]: {
          id: aProv1,
          kind: "provenance_step",
          label: "Capture: chunked 30s",
          artifactId: artifactA,
          hubId: hubArchive,
          collectionId: null,
          commentId: null,
          provenanceStepId: "prov_a_capture",
        },
      },
      threads: {
        [loomThread1]: {
          id: loomThread1,
          type: "discussion",
          fromAnchorId: aTimeline1,
          toAnchorId: aComment1,
          label: "Annotation on key moment",
          strength: 0.9,
          createdAt: iso("2025-11-01T20:00:00.000Z"),
        },
        [loomThread2]: {
          id: loomThread2,
          type: "link",
          fromAnchorId: aTimeline1,
          toAnchorId: aProv1,
          label: "Provenance context",
          strength: 0.6,
          createdAt: iso("2025-11-01T19:20:00.000Z"),
        },
      },
    },
    selection: {
      view: { kind: "library" },
      selectedArtifactId: artifactA,
      selectedCollectionId: collectionFeatured,
      selectedThreadId: null,
      hoveredThreadId: loomThread1,
      activeMarginaliaTab: "threads",
      splitView: { enabled: false, secondaryArtifactId: null },
    },
    filters: {
      searchQuery: "",
      tagIds: [],
      accessPolicies: [],
      onlyNeedsAttention: false,
      threadTypes: [],
    },
    ui: {
      commandPaletteOpen: false,
      lastToast: null,
    },
  };

  return state;
}

