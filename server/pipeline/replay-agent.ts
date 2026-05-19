import crypto from "node:crypto";

import type Database from "better-sqlite3";

import {
  buildReplayConsensusLineageSnapshot,
} from "./replay-consensus-lineage";
import {
  initializeReplayGovernanceSchema,
} from "./replay-governance";
import type {
  ReplayGovernanceAction,
  ReplayGovernanceDecision,
  ReplayGovernanceLineageReference,
  ReplayGovernanceSnapshot,
  ReplayGovernanceState,
  ReplayGovernanceValidatorProfile,
} from "./replay-governance-contract";
import type {
  ReplayAgentAction,
  ReplayAgentCapabilityDeclaration,
  ReplayAgentCapabilityGraph,
  ReplayAgentCapabilityGraphEdge,
  ReplayAgentCapabilityGraphNode,
  ReplayAgentCoordinationRecord,
  ReplayAgentDefinition,
  ReplayAgentIdentity,
  ReplayAgentInput,
  ReplayAgentLineageReference,
  ReplayAgentSnapshot,
  ReplayAgentSpecialization,
  ReplayAgentState,
  ReplayAgentTrustProfile,
  ReplayInterAgentMessage,
  ReplayAgentLifecycleTransition,
} from "./replay-agent-contract";

type SqliteDatabase = Database.Database;

interface PayloadRow {
  readonly payload: string;
}

const DEFAULT_NODE_ID = "edge-setter-local-node";

const SPECIALIZATION_ACTIONS: Readonly<Record<ReplayAgentSpecialization, readonly ReplayAgentAction[]>> = {
  validator: ["validate_replay", "reconcile_divergence"],
  recovery: ["coordinate_recovery", "reconstruct_branch", "promote_branch", "quarantine_branch"],
  arbitration: ["arbitrate_replay", "reconcile_divergence"],
  orchestration: ["validate_replay", "evaluate_governance", "promote_branch", "quarantine_branch"],
  governance: ["evaluate_governance", "promote_branch", "quarantine_branch"],
};

export function initializeReplayAgentSchema(db: SqliteDatabase): void {
  initializeReplayGovernanceSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_agent_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL,
      governance_snapshot_hash TEXT NOT NULL,
      lineage_graph_hash TEXT NOT NULL,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_agent_snapshots_run
      ON replay_agent_snapshots(run_id, generated_at DESC, snapshot_id DESC);

    CREATE TABLE IF NOT EXISTS replay_agent_identities (
      agent_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      specialization TEXT NOT NULL,
      validator_id TEXT,
      deterministic_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_agent_identities_active
      ON replay_agent_identities(run_id, specialization, agent_id);

    CREATE TABLE IF NOT EXISTS replay_agent_trust_profiles (
      profile_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      validator_id TEXT,
      agent_trust_score REAL NOT NULL,
      state TEXT NOT NULL,
      profile_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_agent_trust_agent
      ON replay_agent_trust_profiles(agent_id, run_id);

    CREATE TABLE IF NOT EXISTS replay_agent_lifecycle (
      transition_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      replay_hash TEXT,
      from_state TEXT NOT NULL,
      to_state TEXT NOT NULL,
      action TEXT,
      generated_at TEXT NOT NULL,
      transition_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_agent_lifecycle_run
      ON replay_agent_lifecycle(run_id, generated_at ASC, transition_id ASC);

    CREATE TABLE IF NOT EXISTS replay_agent_messages (
      message_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      from_agent_id TEXT NOT NULL,
      to_agent_id TEXT NOT NULL,
      action TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      message_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_agent_messages_run
      ON replay_agent_messages(run_id, replay_hash, generated_at ASC, message_id ASC);

    CREATE TABLE IF NOT EXISTS replay_agent_lineage_references (
      reference_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      source_lineage_hash TEXT NOT NULL,
      source_reference_hash TEXT NOT NULL,
      reference_kind TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      reference_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_agent_lineage_agent
      ON replay_agent_lineage_references(agent_id, run_id, replay_hash);

    CREATE TABLE IF NOT EXISTS replay_agent_coordination_history (
      coordination_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      governance_action TEXT NOT NULL,
      agent_action TEXT NOT NULL,
      state TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      coordination_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_replay_agent_coordination_replay
      ON replay_agent_coordination_history(run_id, replay_hash, generated_at ASC, coordination_id ASC);

    CREATE TABLE IF NOT EXISTS replay_agent_capability_graphs (
      run_id TEXT PRIMARY KEY,
      graph_hash TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
}

export function buildReplayAgentSnapshot(
  db: SqliteDatabase,
  input: ReplayAgentInput,
): ReplayAgentSnapshot {
  initializeReplayAgentSchema(db);

  const governance = loadLatestGovernanceSnapshot(db, input.run_id);
  if (!governance) {
    throw new Error(`Replay governance snapshot for run ${input.run_id} is not persisted.`);
  }

  const graph = buildReplayConsensusLineageSnapshot(db, input.run_id);
  const definitions = normalizeAgentDefinitions(input, governance);
  const identities = definitions.map((definition) => buildIdentity(input, definition));
  const capabilities = identities.map((identity) => buildCapability(identity, definitions));
  const trustProfiles = identities.map((identity) => buildTrustProfile(identity, governance));
  const lifecycle = buildLifecycle(input, governance, identities, trustProfiles);
  const lineageReferences = buildLineageReferences(input, governance, identities, graph.graph_hash);
  const messages = buildMessages(input, governance, identities, lineageReferences);
  const coordinationHistory = buildCoordinationHistory(input, governance, messages, identities, lineageReferences);
  const capabilityGraph = buildCapabilityGraph(input.run_id, identities, capabilities, messages, trustProfiles);
  const snapshotSeed = {
    run_id: input.run_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    governance_snapshot_hash: governance.deterministic_hash,
    lineage_graph_hash: graph.graph_hash,
    identity_hashes: identities.map((identity) => identity.deterministic_hash),
    capability_hashes: capabilities.map((capability) => capability.capability_hash),
    trust_profile_hashes: trustProfiles.map((profile) => profile.profile_hash),
    lifecycle_hashes: lifecycle.map((transition) => transition.transition_hash),
    message_hashes: messages.map((message) => message.message_hash),
    lineage_reference_hashes: lineageReferences.map((reference) => reference.reference_hash),
    capability_graph_hash: capabilityGraph.graph_hash,
    coordination_hashes: coordinationHistory.map((record) => record.coordination_hash),
  };
  const deterministicSnapshotHash = deterministicHash(snapshotSeed);
  const snapshot = deepFreeze({
    snapshot_id: `replay-agent-snapshot:${deterministicSnapshotHash}`,
    run_id: input.run_id,
    generated_at: input.generated_at,
    persisted_at: input.persisted_at,
    governance_snapshot_hash: governance.deterministic_hash,
    lineage_graph_hash: graph.graph_hash,
    identities,
    capabilities,
    trust_profiles: trustProfiles,
    lifecycle,
    messages,
    lineage_references: lineageReferences,
    capability_graph: capabilityGraph,
    coordination_history: coordinationHistory,
    deterministic_hash: deterministicSnapshotHash,
  });

  persistReplayAgentSnapshot(db, snapshot);
  return snapshot;
}

export function getActiveReplayAgents(
  db: SqliteDatabase,
  runId: string,
): readonly ReplayAgentIdentity[] {
  const snapshot = loadLatestAgentSnapshot(db, runId);
  if (!snapshot) return deepFreeze([]);
  const inactive = new Set(snapshot.trust_profiles
    .filter((profile) => profile.state === "revoked" || profile.state === "quarantined")
    .map((profile) => profile.agent_id));

  return deepFreeze(snapshot.identities.filter((identity) => !inactive.has(identity.agent_id)));
}

export function getReplayAgentTrustProfile(
  db: SqliteDatabase,
  agentId: string,
): ReplayAgentTrustProfile | null {
  initializeReplayAgentSchema(db);
  const row = db.prepare(`
    SELECT payload FROM replay_agent_trust_profiles
    WHERE agent_id = ?
    ORDER BY run_id DESC, profile_id DESC
    LIMIT 1
  `).get(agentId) as PayloadRow | undefined;

  return row ? deepFreeze(JSON.parse(row.payload) as ReplayAgentTrustProfile) : null;
}

export function getReplayAgentLineage(
  db: SqliteDatabase,
  agentId: string,
): readonly ReplayAgentLineageReference[] {
  initializeReplayAgentSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_agent_lineage_references
    WHERE agent_id = ?
    ORDER BY replay_hash ASC, reference_kind ASC, reference_id ASC
  `).all(agentId) as PayloadRow[];

  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayAgentLineageReference));
}

export function getReplayAgentCapabilityGraph(
  db: SqliteDatabase,
  runId: string,
): ReplayAgentCapabilityGraph | null {
  initializeReplayAgentSchema(db);
  const row = db.prepare(`
    SELECT payload FROM replay_agent_capability_graphs
    WHERE run_id = ?
  `).get(runId) as PayloadRow | undefined;

  return row ? deepFreeze(JSON.parse(row.payload) as ReplayAgentCapabilityGraph) : null;
}

export function getReplayCoordinationHistory(
  db: SqliteDatabase,
  runId: string,
  replayHash: string,
): readonly ReplayAgentCoordinationRecord[] {
  initializeReplayAgentSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_agent_coordination_history
    WHERE run_id = ? AND replay_hash = ?
    ORDER BY generated_at ASC, coordination_id ASC
  `).all(runId, replayHash) as PayloadRow[];

  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayAgentCoordinationRecord));
}

export function getReplayInterAgentActivity(
  db: SqliteDatabase,
  runId: string,
): readonly ReplayInterAgentMessage[] {
  initializeReplayAgentSchema(db);
  const rows = db.prepare(`
    SELECT payload FROM replay_agent_messages
    WHERE run_id = ?
    ORDER BY replay_hash ASC, generated_at ASC, message_id ASC
  `).all(runId) as PayloadRow[];

  return deepFreeze(rows.map((row) => JSON.parse(row.payload) as ReplayInterAgentMessage));
}

function persistReplayAgentSnapshot(
  db: SqliteDatabase,
  snapshot: ReplayAgentSnapshot,
): void {
  const write = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO replay_agent_snapshots
      (snapshot_id, run_id, generated_at, persisted_at, governance_snapshot_hash, lineage_graph_hash, deterministic_hash, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      snapshot.snapshot_id,
      snapshot.run_id,
      snapshot.generated_at,
      snapshot.persisted_at,
      snapshot.governance_snapshot_hash,
      snapshot.lineage_graph_hash,
      snapshot.deterministic_hash,
      stableStringify(snapshot),
    );

    for (const identity of snapshot.identities) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_agent_identities
        (agent_id, run_id, node_id, specialization, validator_id, deterministic_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        identity.agent_id,
        identity.run_id,
        identity.node_id,
        identity.specialization,
        identity.validator_id,
        identity.deterministic_hash,
        stableStringify(identity),
      );
    }

    for (const profile of snapshot.trust_profiles) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_agent_trust_profiles
        (profile_id, agent_id, run_id, validator_id, agent_trust_score, state, profile_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        profile.profile_id,
        profile.agent_id,
        profile.run_id,
        profile.validator_id,
        profile.agent_trust_score,
        profile.state,
        profile.profile_hash,
        stableStringify(profile),
      );
    }

    for (const transition of snapshot.lifecycle) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_agent_lifecycle
        (transition_id, agent_id, run_id, replay_hash, from_state, to_state, action, generated_at, transition_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        transition.transition_id,
        transition.agent_id,
        transition.run_id,
        transition.replay_hash,
        transition.from_state,
        transition.to_state,
        transition.action,
        transition.generated_at,
        transition.transition_hash,
        stableStringify(transition),
      );
    }

    for (const message of snapshot.messages) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_agent_messages
        (message_id, run_id, replay_hash, from_agent_id, to_agent_id, action, generated_at, message_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        message.message_id,
        message.run_id,
        message.replay_hash,
        message.from_agent_id,
        message.to_agent_id,
        message.action,
        message.generated_at,
        message.message_hash,
        stableStringify(message),
      );
    }

    for (const reference of snapshot.lineage_references) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_agent_lineage_references
        (reference_id, agent_id, run_id, replay_hash, source_lineage_hash, source_reference_hash, reference_kind, generated_at, reference_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reference.reference_id,
        reference.agent_id,
        reference.run_id,
        reference.replay_hash,
        reference.source_lineage_hash,
        reference.source_reference_hash,
        reference.reference_kind,
        reference.generated_at,
        reference.reference_hash,
        stableStringify(reference),
      );
    }

    for (const record of snapshot.coordination_history) {
      db.prepare(`
        INSERT OR REPLACE INTO replay_agent_coordination_history
        (coordination_id, run_id, replay_hash, governance_action, agent_action, state, generated_at, coordination_hash, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.coordination_id,
        record.run_id,
        record.replay_hash,
        record.governance_action,
        record.agent_action,
        record.state,
        record.generated_at,
        record.coordination_hash,
        stableStringify(record),
      );
    }

    db.prepare(`
      INSERT OR REPLACE INTO replay_agent_capability_graphs
      (run_id, graph_hash, payload)
      VALUES (?, ?, ?)
    `).run(snapshot.run_id, snapshot.capability_graph.graph_hash, stableStringify(snapshot.capability_graph));
  });

  write();
}

function normalizeAgentDefinitions(
  input: ReplayAgentInput,
  governance: ReplayGovernanceSnapshot,
): readonly ReplayAgentDefinition[] {
  const explicit = input.agents ?? [];
  const validatorAgents = governance.validator_profiles.map((profile) => ({
    agent_seed: `validator:${profile.validator_id}`,
    specialization: "validator" as const,
    declared_actions: SPECIALIZATION_ACTIONS.validator,
    replay_scopes: profile.replay_hashes,
    validator_id: profile.validator_id,
    node_id: input.node_id ?? DEFAULT_NODE_ID,
  }));
  const replayScopes = governance.branch_statuses.map((status) => status.replay_hash);
  const defaults: readonly ReplayAgentDefinition[] = [
    {
      agent_seed: "orchestration:primary",
      specialization: "orchestration",
      declared_actions: SPECIALIZATION_ACTIONS.orchestration,
      replay_scopes: replayScopes,
      node_id: input.node_id ?? DEFAULT_NODE_ID,
    },
    {
      agent_seed: "governance:primary",
      specialization: "governance",
      declared_actions: SPECIALIZATION_ACTIONS.governance,
      replay_scopes: replayScopes,
      node_id: input.node_id ?? DEFAULT_NODE_ID,
    },
    {
      agent_seed: "arbitration:primary",
      specialization: "arbitration",
      declared_actions: SPECIALIZATION_ACTIONS.arbitration,
      replay_scopes: replayScopes,
      node_id: input.node_id ?? DEFAULT_NODE_ID,
    },
    {
      agent_seed: "recovery:primary",
      specialization: "recovery",
      declared_actions: SPECIALIZATION_ACTIONS.recovery,
      replay_scopes: replayScopes,
      node_id: input.node_id ?? DEFAULT_NODE_ID,
    },
  ];

  return deepFreeze([...explicit, ...defaults, ...validatorAgents]
    .map((definition) => ({
      agent_seed: definition.agent_seed,
      specialization: definition.specialization,
      declared_actions: normalizeActions(definition.declared_actions),
      replay_scopes: [...(definition.replay_scopes ?? replayScopes)].sort((left, right) => left.localeCompare(right)),
      validator_id: definition.validator_id ?? null,
      node_id: definition.node_id ?? input.node_id ?? DEFAULT_NODE_ID,
    }))
    .sort((left, right) =>
      left.specialization.localeCompare(right.specialization) ||
      left.agent_seed.localeCompare(right.agent_seed),
    ));
}

function buildIdentity(
  input: ReplayAgentInput,
  definition: ReplayAgentDefinition,
): ReplayAgentIdentity {
  const identitySeed = {
    run_id: input.run_id,
    agent_seed: definition.agent_seed,
    specialization: definition.specialization,
    validator_id: definition.validator_id ?? null,
    node_id: definition.node_id ?? input.node_id ?? DEFAULT_NODE_ID,
  };
  const identitySeedHash = deterministicHash(identitySeed);
  const payload = {
    run_id: input.run_id,
    node_id: definition.node_id ?? input.node_id ?? DEFAULT_NODE_ID,
    specialization: definition.specialization,
    validator_id: definition.validator_id ?? null,
    identity_seed_hash: identitySeedHash,
    public_identity_hash: deterministicHash({
      node_id: definition.node_id ?? input.node_id ?? DEFAULT_NODE_ID,
      identity_seed_hash: identitySeedHash,
      distributed_node_compatible: true,
    }),
  };
  const deterministicIdentityHash = deterministicHash(payload);

  return deepFreeze({
    agent_id: `replay-agent:${deterministicIdentityHash}`,
    ...payload,
    deterministic_hash: deterministicIdentityHash,
  });
}

function buildCapability(
  identity: ReplayAgentIdentity,
  definitions: readonly ReplayAgentDefinition[],
): ReplayAgentCapabilityDeclaration {
  const definition = definitions.find((candidate) =>
    candidate.specialization === identity.specialization &&
    (candidate.validator_id ?? null) === identity.validator_id,
  );
  const payload = {
    specialization: identity.specialization,
    actions: normalizeActions(definition?.declared_actions ?? SPECIALIZATION_ACTIONS[identity.specialization]),
    replay_scopes: [...(definition?.replay_scopes ?? [])].sort((left, right) => left.localeCompare(right)),
    distributed_node_compatible: true,
  };
  const capabilityHash = deterministicHash({
    agent_id: identity.agent_id,
    ...payload,
  });

  return deepFreeze({
    capability_id: `replay-agent-capability:${capabilityHash}`,
    ...payload,
    capability_hash: capabilityHash,
  });
}

function buildTrustProfile(
  identity: ReplayAgentIdentity,
  governance: ReplayGovernanceSnapshot,
): ReplayAgentTrustProfile {
  const governanceProfile = identity.validator_id
    ? governance.validator_profiles.find((profile) => profile.validator_id === identity.validator_id)
    : null;
  const governanceTrustScore = governanceProfile?.trust_score ?? null;
  const baseScore = governanceTrustScore ?? specializationBaseTrust(identity.specialization);
  const recommendedAction = governanceProfile?.recommended_action ?? null;
  const state = stateForTrust(identity.specialization, baseScore, recommendedAction, governance);
  const agentTrustScore = roundAgentNumber(Math.max(0, Math.min(100, baseScore - statePenalty(state))));
  const payload = {
    agent_id: identity.agent_id,
    run_id: identity.run_id,
    validator_id: identity.validator_id,
    governance_trust_score: governanceTrustScore,
    agent_trust_score: agentTrustScore,
    state,
    recommended_governance_action: recommendedAction,
  };
  const profileHash = deterministicHash(payload);

  return deepFreeze({
    profile_id: `replay-agent-trust:${profileHash}`,
    ...payload,
    profile_hash: profileHash,
  });
}

function buildLifecycle(
  input: ReplayAgentInput,
  governance: ReplayGovernanceSnapshot,
  identities: readonly ReplayAgentIdentity[],
  trustProfiles: readonly ReplayAgentTrustProfile[],
): readonly ReplayAgentLifecycleTransition[] {
  const transitions: ReplayAgentLifecycleTransition[] = [];

  for (const identity of identities) {
    const profile = trustProfiles.find((candidate) => candidate.agent_id === identity.agent_id);
    transitions.push(buildTransition({
      input,
      identity,
      replayHash: null,
      fromState: "initializing",
      toState: profile?.state ?? "active",
      action: null,
      governanceState: null,
      governanceDecisionHash: null,
      reason: `agent_registered:${identity.specialization}`,
    }));
  }

  for (const decision of governance.decisions) {
    const agent = chooseAgentForDecision(decision, identities);
    if (!agent) continue;
    transitions.push(buildTransition({
      input,
      identity: agent,
      replayHash: decision.replay_hash,
      fromState: trustProfiles.find((profile) => profile.agent_id === agent.agent_id)?.state ?? "active",
      toState: stateForGovernanceDecision(decision),
      action: actionForGovernanceDecision(decision),
      governanceState: decision.state,
      governanceDecisionHash: decision.deterministic_hash,
      reason: `governance_decision:${decision.action}`,
    }));
  }

  return deepFreeze(transitions.sort((left, right) =>
    (left.replay_hash ?? "").localeCompare(right.replay_hash ?? "") ||
    left.agent_id.localeCompare(right.agent_id) ||
    left.transition_hash.localeCompare(right.transition_hash),
  ));
}

function buildMessages(
  input: ReplayAgentInput,
  governance: ReplayGovernanceSnapshot,
  identities: readonly ReplayAgentIdentity[],
  lineageReferences: readonly ReplayAgentLineageReference[],
): readonly ReplayInterAgentMessage[] {
  const messages: ReplayInterAgentMessage[] = [];
  const governanceAgent = findSpecializedAgent(identities, "governance");
  const orchestrationAgent = findSpecializedAgent(identities, "orchestration");

  for (const decision of governance.decisions) {
    const targetAgent = chooseAgentForDecision(decision, identities);
    if (!governanceAgent || !targetAgent) continue;
    messages.push(buildMessage({
      input,
      replayHash: decision.replay_hash,
      fromAgentId: governanceAgent.agent_id,
      toAgentId: targetAgent.agent_id,
      action: actionForGovernanceDecision(decision),
      governanceDecisionHash: decision.deterministic_hash,
      lineageReferenceHashes: lineageReferences
        .filter((reference) => reference.replay_hash === decision.replay_hash)
        .map((reference) => reference.reference_hash),
    }));

    if (orchestrationAgent && orchestrationAgent.agent_id !== targetAgent.agent_id) {
      messages.push(buildMessage({
        input,
        replayHash: decision.replay_hash,
        fromAgentId: targetAgent.agent_id,
        toAgentId: orchestrationAgent.agent_id,
        action: decision.action === "promote_branch" ? "promote_branch" : "evaluate_governance",
        governanceDecisionHash: decision.deterministic_hash,
        lineageReferenceHashes: lineageReferences
          .filter((reference) => reference.replay_hash === decision.replay_hash)
          .map((reference) => reference.reference_hash),
      }));
    }
  }

  return deepFreeze(messages.sort((left, right) =>
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.from_agent_id.localeCompare(right.from_agent_id) ||
    left.to_agent_id.localeCompare(right.to_agent_id) ||
    left.message_hash.localeCompare(right.message_hash),
  ));
}

function buildCoordinationHistory(
  input: ReplayAgentInput,
  governance: ReplayGovernanceSnapshot,
  messages: readonly ReplayInterAgentMessage[],
  identities: readonly ReplayAgentIdentity[],
  lineageReferences: readonly ReplayAgentLineageReference[],
): readonly ReplayAgentCoordinationRecord[] {
  return deepFreeze(governance.decisions.map((decision) => {
    const replayMessages = messages.filter((message) => message.replay_hash === decision.replay_hash);
    const assignedAgentIds = Array.from(new Set([
      chooseAgentForDecision(decision, identities)?.agent_id,
      ...replayMessages.flatMap((message) => [message.from_agent_id, message.to_agent_id]),
    ].filter((agentId): agentId is string => Boolean(agentId)))).sort((left, right) => left.localeCompare(right));
    const payload = {
      run_id: input.run_id,
      replay_hash: decision.replay_hash,
      governance_action: decision.action,
      agent_action: actionForGovernanceDecision(decision),
      state: stateForGovernanceDecision(decision),
      assigned_agent_ids: assignedAgentIds,
      governance_decision_hash: decision.deterministic_hash,
      message_hashes: replayMessages.map((message) => message.message_hash),
      lineage_reference_hashes: lineageReferences
        .filter((reference) => reference.replay_hash === decision.replay_hash)
        .map((reference) => reference.reference_hash),
      generated_at: input.generated_at,
    };
    const coordinationHash = deterministicHash(payload);

    return {
      coordination_id: `replay-agent-coordination:${coordinationHash}`,
      ...payload,
      coordination_hash: coordinationHash,
    };
  }).sort((left, right) =>
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.coordination_hash.localeCompare(right.coordination_hash),
  ));
}

function buildLineageReferences(
  input: ReplayAgentInput,
  governance: ReplayGovernanceSnapshot,
  identities: readonly ReplayAgentIdentity[],
  graphHash: string,
): readonly ReplayAgentLineageReference[] {
  const references: ReplayAgentLineageReference[] = [];

  for (const decision of governance.decisions) {
    const agent = chooseAgentForDecision(decision, identities);
    if (!agent) continue;
    for (const referenceHash of decision.lineage_reference_hashes) {
      const governanceReference = governance.lineage_references.find((reference) => reference.reference_hash === referenceHash);
      references.push(buildAgentLineageReference({
        input,
        agentId: agent.agent_id,
        replayHash: decision.replay_hash,
        sourceLineageHash: governanceReference?.lineage_hash ?? graphHash,
        sourceReferenceHash: referenceHash,
        referenceKind: "governance",
      }));
    }
    references.push(buildAgentLineageReference({
      input,
      agentId: agent.agent_id,
      replayHash: decision.replay_hash,
      sourceLineageHash: graphHash,
      sourceReferenceHash: decision.deterministic_hash,
      referenceKind: "consensus_graph",
    }));
  }

  return deepFreeze([...dedupeBy(references, (reference) => reference.reference_id)]
    .sort((left, right) =>
      left.agent_id.localeCompare(right.agent_id) ||
      left.replay_hash.localeCompare(right.replay_hash) ||
      left.reference_hash.localeCompare(right.reference_hash),
    ));
}

function buildCapabilityGraph(
  runId: string,
  identities: readonly ReplayAgentIdentity[],
  capabilities: readonly ReplayAgentCapabilityDeclaration[],
  messages: readonly ReplayInterAgentMessage[],
  trustProfiles: readonly ReplayAgentTrustProfile[],
): ReplayAgentCapabilityGraph {
  const nodes = identities.map((identity) => {
    const capability = capabilities.find((candidate) => candidate.specialization === identity.specialization);
    const payload = {
      agent_id: identity.agent_id,
      specialization: identity.specialization,
      capability_hash: capability?.capability_hash ?? identity.deterministic_hash,
      state: trustProfiles.find((profile) => profile.agent_id === identity.agent_id)?.state ?? "active",
    };

    return {
      node_id: `replay-agent-capability-node:${deterministicHash(payload)}`,
      ...payload,
      node_hash: deterministicHash(payload),
    };
  }).sort((left, right) =>
    left.specialization.localeCompare(right.specialization) ||
    left.agent_id.localeCompare(right.agent_id),
  );
  const edges = messages.map((message) => {
    const payload = {
      from_agent_id: message.from_agent_id,
      to_agent_id: message.to_agent_id,
      action: message.action,
      replay_hash: message.replay_hash,
    };
    const edgeHash = deterministicHash(payload);

    return {
      edge_id: `replay-agent-capability-edge:${edgeHash}`,
      ...payload,
      edge_hash: edgeHash,
    };
  }).sort((left, right) =>
    left.replay_hash.localeCompare(right.replay_hash) ||
    left.action.localeCompare(right.action) ||
    left.edge_hash.localeCompare(right.edge_hash),
  );
  const graphPayload = {
    run_id: runId,
    node_hashes: nodes.map((node) => node.node_hash),
    edge_hashes: edges.map((edge) => edge.edge_hash),
  };

  return deepFreeze({
    run_id: runId,
    nodes,
    edges,
    graph_hash: deterministicHash(graphPayload),
  });
}

function buildTransition(input: {
  readonly input: ReplayAgentInput;
  readonly identity: ReplayAgentIdentity;
  readonly replayHash: string | null;
  readonly fromState: ReplayAgentState;
  readonly toState: ReplayAgentState;
  readonly action: ReplayAgentAction | null;
  readonly governanceState: ReplayGovernanceState | null;
  readonly governanceDecisionHash: string | null;
  readonly reason: string;
}): ReplayAgentLifecycleTransition {
  const payload = {
    agent_id: input.identity.agent_id,
    run_id: input.input.run_id,
    replay_hash: input.replayHash,
    from_state: input.fromState,
    to_state: input.toState,
    action: input.action,
    governance_state: input.governanceState,
    governance_decision_hash: input.governanceDecisionHash,
    reason: input.reason,
    generated_at: input.input.generated_at,
  };
  const transitionHash = deterministicHash(payload);

  return deepFreeze({
    transition_id: `replay-agent-transition:${transitionHash}`,
    ...payload,
    transition_hash: transitionHash,
  });
}

function buildMessage(input: {
  readonly input: ReplayAgentInput;
  readonly replayHash: string;
  readonly fromAgentId: string;
  readonly toAgentId: string;
  readonly action: ReplayAgentAction;
  readonly governanceDecisionHash: string;
  readonly lineageReferenceHashes: readonly string[];
}): ReplayInterAgentMessage {
  const payloadSeed = {
    replay_hash: input.replayHash,
    action: input.action,
    governance_decision_hash: input.governanceDecisionHash,
    lineage_reference_hashes: input.lineageReferenceHashes,
  };
  const payload = {
    run_id: input.input.run_id,
    replay_hash: input.replayHash,
    from_agent_id: input.fromAgentId,
    to_agent_id: input.toAgentId,
    action: input.action,
    payload_hash: deterministicHash(payloadSeed),
    governance_decision_hash: input.governanceDecisionHash,
    lineage_reference_hashes: [...input.lineageReferenceHashes].sort((left, right) => left.localeCompare(right)),
    generated_at: input.input.generated_at,
  };
  const messageHash = deterministicHash(payload);

  return deepFreeze({
    message_id: `replay-agent-message:${messageHash}`,
    ...payload,
    message_hash: messageHash,
  });
}

function buildAgentLineageReference(input: {
  readonly input: ReplayAgentInput;
  readonly agentId: string;
  readonly replayHash: string;
  readonly sourceLineageHash: string;
  readonly sourceReferenceHash: string;
  readonly referenceKind: ReplayAgentLineageReference["reference_kind"];
}): ReplayAgentLineageReference {
  const payload = {
    agent_id: input.agentId,
    run_id: input.input.run_id,
    replay_hash: input.replayHash,
    source_lineage_hash: input.sourceLineageHash,
    source_reference_hash: input.sourceReferenceHash,
    reference_kind: input.referenceKind,
    generated_at: input.input.generated_at,
  };
  const referenceHash = deterministicHash(payload);

  return deepFreeze({
    reference_id: `replay-agent-lineage:${referenceHash}`,
    ...payload,
    reference_hash: referenceHash,
  });
}

function loadLatestGovernanceSnapshot(
  db: SqliteDatabase,
  runId: string,
): ReplayGovernanceSnapshot | null {
  const row = db.prepare(`
    SELECT payload FROM replay_governance_snapshots
    WHERE run_id = ?
    ORDER BY generated_at DESC, snapshot_id DESC
    LIMIT 1
  `).get(runId) as PayloadRow | undefined;

  return row ? deepFreeze(JSON.parse(row.payload) as ReplayGovernanceSnapshot) : null;
}

function loadLatestAgentSnapshot(
  db: SqliteDatabase,
  runId: string,
): ReplayAgentSnapshot | null {
  initializeReplayAgentSchema(db);
  const row = db.prepare(`
    SELECT payload FROM replay_agent_snapshots
    WHERE run_id = ?
    ORDER BY generated_at DESC, snapshot_id DESC
    LIMIT 1
  `).get(runId) as PayloadRow | undefined;

  return row ? deepFreeze(JSON.parse(row.payload) as ReplayAgentSnapshot) : null;
}

function chooseAgentForDecision(
  decision: ReplayGovernanceDecision,
  identities: readonly ReplayAgentIdentity[],
): ReplayAgentIdentity | null {
  switch (decision.action) {
    case "reject_branch":
    case "override_arbitration":
      return findSpecializedAgent(identities, "arbitration");
    case "quarantine_branch":
    case "elevate_recovery":
      return findSpecializedAgent(identities, "recovery");
    case "promote_branch":
    case "approve_branch":
      return findSpecializedAgent(identities, "orchestration");
    case "require_review":
    case "revoke_validator":
    case "reduce_validator_weight":
      return findSpecializedAgent(identities, "governance");
  }
}

function findSpecializedAgent(
  identities: readonly ReplayAgentIdentity[],
  specialization: ReplayAgentSpecialization,
): ReplayAgentIdentity | null {
  return identities.find((identity) => identity.specialization === specialization) ?? null;
}

function actionForGovernanceDecision(decision: ReplayGovernanceDecision): ReplayAgentAction {
  switch (decision.action) {
    case "reject_branch":
    case "override_arbitration":
      return "arbitrate_replay";
    case "quarantine_branch":
      return "quarantine_branch";
    case "elevate_recovery":
      return "coordinate_recovery";
    case "promote_branch":
    case "approve_branch":
      return "promote_branch";
    case "require_review":
    case "revoke_validator":
    case "reduce_validator_weight":
      return "evaluate_governance";
  }
}

function stateForGovernanceDecision(decision: ReplayGovernanceDecision): ReplayAgentState {
  switch (decision.state) {
    case "quarantined":
      return "quarantined";
    case "escalated":
      return "degraded";
    case "rejected":
      return "revoked";
    case "stabilized":
      return decision.action === "elevate_recovery" ? "recovering" : "active";
    case "pending_review":
      return "degraded";
    case "approved":
      return "active";
  }
}

function stateForTrust(
  specialization: ReplayAgentSpecialization,
  trustScore: number,
  recommendedAction: ReplayGovernanceAction | null,
  governance: ReplayGovernanceSnapshot,
): ReplayAgentState {
  if (recommendedAction === "revoke_validator") return "revoked";
  if (recommendedAction === "reduce_validator_weight") return "degraded";
  if (specialization === "recovery" && governance.decisions.some((decision) => decision.action === "elevate_recovery")) return "recovering";
  if (specialization === "arbitration" && governance.decisions.some((decision) => decision.action === "override_arbitration")) return "degraded";
  if (trustScore < 35) return "revoked";
  if (trustScore < 70) return "degraded";
  return "active";
}

function specializationBaseTrust(specialization: ReplayAgentSpecialization): number {
  switch (specialization) {
    case "governance":
      return 94;
    case "orchestration":
      return 92;
    case "recovery":
      return 88;
    case "arbitration":
      return 86;
    case "validator":
      return 82;
  }
}

function statePenalty(state: ReplayAgentState): number {
  switch (state) {
    case "active":
    case "initializing":
      return 0;
    case "recovering":
      return 4;
    case "degraded":
      return 12;
    case "quarantined":
      return 24;
    case "revoked":
      return 60;
  }
}

function normalizeActions(actions: readonly ReplayAgentAction[]): readonly ReplayAgentAction[] {
  return deepFreeze(Array.from(new Set(actions)).sort((left, right) => left.localeCompare(right)));
}

function dedupeBy<T>(
  values: readonly T[],
  getKey: (value: T) => string,
): readonly T[] {
  return Array.from(new Map(values.map((value) => [getKey(value), value])).values());
}

function roundAgentNumber(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function computeReplayAgentDeterministicHash(value: unknown): string {
  return deterministicHash(value);
}

function deterministicHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(value))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortAgentKeys(value));
}

function sortAgentKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortAgentKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortAgentKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (typeof value === "undefined") return null;
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
  }

  return value;
}
