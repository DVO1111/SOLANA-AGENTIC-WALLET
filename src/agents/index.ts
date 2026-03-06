// agents module exports
export { Agent } from './Agent';
export type { AgentConfig, Decision, AgentState, StrategyContext, FeedbackEntry } from './Agent';
export { MultiAgentTestHarness } from './simulation';
export { RuleBasedBrain, LLMBrain, createBrain } from './AgentBrain';
export type { IAgentBrain, EnvironmentState, AgentIntent, ReasoningTrace } from './AgentBrain';
