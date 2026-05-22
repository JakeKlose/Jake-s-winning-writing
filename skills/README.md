# Skills

Claude skills for *Winning Writing*. Each is a focused tool — invoked when you're working on that specific kind of writing.

## Install

### Claude Code (CLI)
```bash
cp -r skills/* ~/.claude/skills/
```

### Claude Cowork (desktop)
1. Open the folder you've pointed Cowork at
2. Drop the `skills/` directory inside it (or merge with an existing `skills/` folder)
3. Restart the session

Each skill has frontmatter that tells Claude when to auto-invoke it.

## The skills

### Drafting and critique
| Skill | Triggers when |
|-------|---------------|
| [cold-email-coach](cold-email-coach/SKILL.md) | Drafting or critiquing a cold email, LinkedIn DM, intro request |
| [op-ed-coach](op-ed-coach/SKILL.md) | Drafting an op-ed, opinion piece, or LinkedIn long-form |
| [pitch-coach](pitch-coach/SKILL.md) | VC pitch, internal pitch, six-word product summary, mission statement |
| [pitch-memo](pitch-memo/SKILL.md) | Text-first investor memo for pre-seed and seed founders — Constine's 15 questions |
| [gratitude-note-coach](gratitude-note-coach/SKILL.md) | Thank-you notes, recommendation letters, recognition |
| [dealing-with-reporters](dealing-with-reporters/SKILL.md) | Drafting answers to reporter questions, on-the-record statements, crisis comms — Sorkin's 11 rules + AP attribution, with the Sorkin/Tylenol-Kramon school tension named explicitly |
| [yourself-story](yourself-story/SKILL.md) | Bios, LinkedIn About sections, intro slides, "tell me about yourself" — Bryant + Weinstein + the six Kramon model bios |
| [winning-writing-critic](winning-writing-critic/SKILL.md) | Grading any draft against the full rubric and rewriting |

### Cold-outreach pipeline (run in order before drafting)
| Skill | Triggers when |
|-------|---------------|
| [recipient-research](recipient-research/SKILL.md) | Building a dossier on someone you want to email — public role, podcasts, distinctive details |
| [connection-finder](connection-finder/SKILL.md) | Finding specific, genuine "like you" hooks between you and the recipient |
| [warm-intro-finder](warm-intro-finder/SKILL.md) | Finding human bridges who can actually introduce you — investors, alumni, ex-colleagues, mentors |
| [graveyard-historian](graveyard-historian/SKILL.md) | When pitching an idea, researches companies that tried it before and died — why, and who survived to talk to |
| [fun-angle](fun-angle/SKILL.md) | Adding the dry / self-deprecating / unexpected line that makes the email memorable |

### Surgical edits
| Skill | Triggers when |
|-------|---------------|
| [style-tells](style-tells/SKILL.md) | Scrubs em-dashes, empty adverbs, and consultant jargon. Three targets behind one skill: `--target em-dashes\|adverbs\|jargon\|all` |
| [vividness](vividness/SKILL.md) | Pushes abstract → concrete at two scales. `--mode noun-level\|scene-level\|both`. "Dog" → "German shepherd"; "I was angry" → body signal + room + dialogue |
| [compression](compression/SKILL.md) | Cuts to a target word count and/or kills redundancy. `--mode target-count\|redundancy\|both`, `--target-words N` |
| [tell-them-something-new](tell-them-something-new/SKILL.md) | Cutting opener sentences that recap what the recipient already knows — replace with a secret about the future |
| [warmth-and-competence](warmth-and-competence/SKILL.md) | Auditing a draft on Fiske's two-axis model — warmth + competence — and finding the load-bearing sentence that hits both |
| [headline-as-claim](headline-as-claim/SKILL.md) | Rewriting section titles, slide titles, and subject lines from category labels ("Product," "Market") into bold arguable claims |
| [bluf-rewriter](bluf-rewriter/SKILL.md) | Re-organizing so the bottom line is up front |
| [humanize](humanize/SKILL.md) | Roughening up a too-clean draft — contractions, dropped subjects, exactly one harmless micro-typo |
| [pick-a-lane](pick-a-lane/SKILL.md) | Diagnosing drafts that tell three half-stories instead of one full one — different from compression, this cuts whole stories, not just words |
| [irrelevant-detail-killer](irrelevant-detail-killer/SKILL.md) | Cuts cinematic details that are vivid but don't serve the main point — different from compression (cuts words) and pick-a-lane (cuts stories); this cuts within a story |

## How they fit together

The recommended cold-outreach flow:

```
recipient-research → connection-finder → fun-angle → cold-email-coach
```

For everything else, `winning-writing-critic` is the orchestrator — invoke it when you don't know which specialized skill applies, and it'll grade the draft and route to the right one. Most skills point back to `points/` for the source rules.
