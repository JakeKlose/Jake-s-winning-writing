---
name: show-dont-tell
description: Turns abstract emotional or narrative summaries into vivid scenes. Replaces "I was angry" with the body signal, the room, the dialogue, the moment. Implements Lauren Weinstein's "could a director recreate this scene?" test from Glenn Kramon's Winning Writing class. Use when a story is technically correct but flat — when it tells the reader what happened instead of letting them feel it. Triggers on "show don't tell," "make it more vivid," "this feels flat," "less abstract," "more cinematic," "find the colors," "unpack the scene."
---

# Show, don't tell

Source: Lauren Weinstein's guest lecture in Glenn Kramon's Winning Writing class (GSB, Spring 2026). Companion to `be-specific` (which replaces generic nouns) and `op-ed-coach` (which uses cinematic openers).

## The premise

Most people summarize their stories. They write things like:

> *"It was a difficult time. I didn't have money. I didn't have hope. Things looked dismal."*

That tells the audience what happened. It doesn't let them feel it. The audience can't see the room, hear the conversation, or sense the stakes.

The same story, shown:

> *"Six days a week I ate beans and weenies. I dug for change in the crevices of my couch so I could buy my son milk. There were nights my heart raced. I got sick of my own story. Is this my future? No, I can't handle that."*

Same facts. Now the reader is in the room.

The work is what Weinstein called *finding the colors*: going back through the story and naming what the storyteller was thinking, seeing, and feeling in the body.

## The three questions

For every important moment in a story, ask:

**1. What were you seeing?**
The room, the couch, the phone, the food, the facial expression, the screen, the weather, the temperature, the object in your hand. What was physically there.

**2. What were you thinking?**
The internal dialogue. The question you were asking yourself. The fear in the back of your mind. The belief in that moment.

**3. What were you feeling in your body?**
Not the emotion label. The body signal. Heart racing. Throat tight. Chest heavy. Hands shaking. Heat rising. Wanting to disappear.

If the storyteller can answer these three for the key moment, the scene starts to come alive.

## The director test

Lauren Weinstein's standard:

> **Could a movie director recreate this scene from what you wrote?**

If yes, the story is vivid. If no, it's still abstract.

Three examples she praised:

- **Steve Jobs** doesn't say "I was resourceful." He says he was 12, looked up Bill Hewlett's number in the Palo Alto phone book, called him, asked for spare parts, and got a summer job.
- **Oprah** doesn't say "Sidney Poitier inspired me." She says she was sitting on the linoleum floor of her mother's house in Milwaukee, watching the Oscars, while her mother came home bone-tired from cleaning other people's houses.
- **Brené Brown** doesn't say "I felt ashamed after reading online comments." She shows herself checking the YouTube view count, reading cruel comments, sitting in Houston with peanut butter, *Downton Abbey*, Uggs, a hoodie, and the thermostat at 58.

The reader has to feel like they're in the scene with you.

## Replace emotion labels with body signals

Weak:

> *I was angry.*

Stronger:

> *The hair on the back of my neck stood up. Fumes felt like they were coming out of my nose. My chest was about to pop, and I knew I was one second away from saying something I'd regret forever.*

Common label-to-body swaps:

| Label | Body signal |
|---|---|
| I was stressed | I refreshed the inbox every thirty seconds, knowing nothing had changed |
| I was poor | I counted coins from the couch cushions to buy milk |
| I was angry | The hair on my neck stood up; I bit back the sentence I knew I'd regret |
| I was scared | I read the message three times, then put the phone face-down |
| I worked hard | The office was dark except my screen; the deck still had 17 red comments at midnight |
| I was proud | When the customer said yes, I looked down because I didn't want the team to see me tear up |
| I was exhausted | I sat in the car for ten minutes before I could open the door |
| I was disappointed | I closed the laptop without saying anything and walked to the kitchen |

The pattern: name the action, the object, the body, or the moment that made the emotion show.

## Story structure: Situation → Action → Result

A vivid scene still needs a spine. Weinstein's simplification:

1. **Situation.** The person, place, time, and tension. Who, where, when, what's at stake.
2. **Action.** Something happens. The character does something specific.
3. **Result.** Something changes. The audience learns something about the person.

Worked through the three examples:

- **Steve Jobs.** *Situation:* 12 years old, Palo Alto, wants to build a frequency counter, no parts. *Action:* Looks up Bill Hewlett's home number in the phone book, calls him cold, asks for parts. *Result:* Gets the parts and a summer job. The audience learns: this kid asks for what he needs.
- **Oprah.** *Situation:* Little girl on the linoleum floor in Milwaukee, watching the Oscars. *Action:* Sees Sidney Poitier celebrated by an industry that doesn't usually celebrate Black men. *Result:* Understands what representation can mean, decides what she'll do with her own platform.
- **Brené Brown.** *Situation:* Just gave a vulnerable TED talk, sitting at home in Houston, Uggs and a hoodie, thermostat at 58. *Action:* Reads cruel YouTube comments, eats peanut butter from the jar, watches *Downton Abbey* to escape. *Result:* Finds the Roosevelt "arena" quote and changes how she handles criticism.

Each one is *Situation → Action → Result*. Each one passes the director test.

## The skill workflow

When given a story to improve:

1. **Identify the abstract or summarized parts.** Lines like "it was hard," "I felt lost," "they were impressive," "I worked through it." These are tells.
2. **Pick the moment that matters most.** Not every line should be cinematic. The pivotal beat is what the audience needs to feel.
3. **Ask the three questions** for that moment: what was seen, thought, felt in the body.
4. **Add the concrete details** that answer them. Object, room, dialogue, sensory detail, body signal.
5. **Run the director test.** If a film crew couldn't shoot it from your text, keep going.
6. **Confirm Situation → Action → Result.** The spine should still be visible.

## Output format

```
## Original
[the story as given]

## Show-don't-tell pass
[the rewritten version with concrete details added]

## What changed
- Abstract claim "[X]" → scene with [seeing/thinking/feeling detail]
- Added object/setting: [what you added]
- Added body signal in place of emotion label: [where, what]
- Added dialogue or internal dialogue: [where]

## Director test
Could a film crew shoot this from the text? [yes/no, with one-line justification]

## Spine check
- Situation: [one sentence]
- Action: [one sentence]
- Result: [one sentence]
```

## When NOT to use

Show-don't-tell is for stories. It's the wrong move for:

- **Status updates and operational memos.** Exec readers want the headline, not the scene. Use `bluf-rewriter` or `headline-as-claim` instead.
- **Technical specs and design docs.** The reader wants the system, not the writer's interior life.
- **Resume bullets.** Bullets compress; scenes expand. Keep bullets crisp.
- **Anywhere length is the constraint** (Twitter, headlines, six-word summaries). Compression beats vividness here.
- **Writing where the user wasn't actually present.** If you weren't in the scene, don't fabricate sensory detail. Make it specific without inventing what the person saw, thought, or felt.

For op-eds, cold emails with a personal hook, About sections, applications, gratitude notes, pitches with a founder origin story, and any first-person essay: this is the right tool.

## The litmus test

After the rewrite, read it aloud. Two questions:

1. Could a director recreate this scene?
2. Does the audience feel what the storyteller felt, without being told what to feel?

If yes to both, ship. If the answer is "the writer told me they felt sad" rather than "I felt sad reading this," the scene still needs more colors.

## Avoid melodrama

The opposite failure mode is overwriting. Three rules:

- **One body signal per moment, not three.** "My heart raced and my throat tightened and my hands shook" reads as a parody. Pick the one signal that most fits the moment.
- **Specific objects beat lyrical adjectives.** "Beans and weenies" beats "humble fare." "Thermostat at 58" beats "the room was cold."
- **Trust the reader.** Don't follow the scene with a paragraph explaining what it meant. The scene is the meaning.

The goal is a real person telling a vivid story, not a writer performing emotion.
