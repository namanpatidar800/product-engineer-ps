export class DeterministicPolicy {
  evaluate(input) {
    const normalized = input.toLowerCase();
    return normalized.includes('[reject]') || normalized.includes('blocked request')
      ? { allowed: false, reasonCode: 'demo_policy_match' }
      : { allowed: true, reasonCode: 'allowed' };
  }
}
