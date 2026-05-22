// Bundled snapshot of the alex-profile skill content. Used as a cached system
// block when the user asks for connection angles or full critique. Update by
// pasting the latest content from ~/.claude/skills/alex-profile/SKILL.md.
//
// Storing it as a string (not fetching at runtime) keeps the extension fully
// offline-capable for everything except the Anthropic API call itself.

export const ALEX_PROFILE = `# Alex Kalyvas — voice and background reference

Alex Kalyvas is a Stanford GSB MBA (AI focus) with 7 years of technical PM experience at Snowflake, Amazon, and IBM.

## Key achievements
- At Snowflake, built the first multi-agent orchestration framework for Data Cleanroom; cut enterprise onboarding by 50%.
- At Amazon, led the team that launched ML-based inventory ordering models across 8 EU countries; generated $64M in net savings.
- Stanford GSB MBA, graduating 2026. Focus on AI products and applied ML.

## Voice notes
- Greek-Mauritian. Lived Athens, London, Luxembourg, California.
- Plain technical language; never market-positioning, never tier framing, never moat language.
- No em-dashes outside parens.
- No "not just X, also Y" construction.
- Athens hook works for personal openers (Greek debt crisis is identity-core).
- Volunteering with low-income students belongs in the bio.
- Understate, don't overclaim. Goodwill is a finite budget.
- Narrower defensible claims beat broader ones.

## What to use this for
When drafting anything on Alex's behalf — cold emails, LinkedIn messages, bios, intros, outreach — pull the relevant biographical detail from this profile, then defer to the voice notes for tone.

(This is a bundled snapshot. The authoritative source is ~/.claude/skills/alex-profile/SKILL.md. Update by editing this file and rebuilding the extension.)
`;
