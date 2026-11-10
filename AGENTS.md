# Repository guidance for coding agents

## Keep the place ridiculous

This is Tyler's absurd playground for close friends. It takes itself seriously approximately never. You play blackjack, mine acid, get lectured by a sassy Foreman, receive money from a wandering faun, and raise mine bugs to fight in a barn. The inside jokes and homemade character are the point.

- Keep the deadpan nonsense, petty grievances, strange encounters and distinct character voices. Read nearby dialogue before writing more; every character need not sound like the same quippy assistant. Let jokes land without explaining them.
- Invent new absurd jokes and characters freely; connect them to this world. Ask before using a real friend's face or personal details in something new. Preserve established voices and in-jokes when cleaning up a feature.
- Keep the scale appropriate to a friends' hangout. Avoid corporate copy, generic engagement systems and extra configuration nobody asked for. Texture, pixel art, theatrical scenes and deliberate scrappiness belong here.

## Make it easy to play

Keep the world ridiculous and the controls obvious. A polished interaction can still have a very stupid premise.

- Start by removing what the screen does not need. Give the game or scene, relevant state and next action a clear hierarchy.
- Keep copy short. Do not explain obvious buttons or repeat instructions in a banner, sidebar and footer. Give unfamiliar interactions one brief hint where needed; put longer help on demand. Keep labels, costs, outcomes and error recovery clear, even when the surrounding copy is a joke.
- Show controls when relevant: selecting an object can reveal its actions instead of displaying every possible action at once. Keep essentials and keyboard/touch alternatives discoverable; help must not depend on hover.
- Group with spacing, alignment and typography before adding containers. Avoid boxes inside boxes, a card around every label, piles of badges and repeated summaries. Use panels only when they clarify a boundary.
- Reuse consistent button sizes and styles for equivalent roles. Make the primary action clear without making every action compete for attention.
- Give gags room to land. Avoid stacking constant chatter, motion and popups. Preserve sound/gag controls, reduced motion, readable contrast, keyboard access and usable touch targets. Effects must not steal input or obscure time-sensitive play.
- For UI changes, check the real interaction on desktop and narrow/short mobile layouts, including loading, empty and error states. Check what happens after a tap, not just whether the screenshot looks good. Remove clutter without sanding off the personality.

## Work in the repository

Read [CONTRIBUTING.md](CONTRIBUTING.md) and any notes relevant to the change. Keep changes focused; reuse existing code, dependencies and the test runner.

Documentation should earn its place. Keep setup, privacy, persistence and non-obvious contracts accurate in existing notes. Ordinary UI changes do not need a walkthrough or a new guide. Add a document only when someone needs information that the UI, code or tests cannot reasonably provide. Put change history and test results in the PR, not an expanding documentation diary.

Run appropriate checks from [Development](docs/development.md); report actual results and anything untested in the PR. Separate existing failures from new ones. Check examples and links when touching docs.

Treat tables without a visibility field as private. Private tables use invite-link access; do not describe them as host-approved or password-protected. Preserve local data and never commit credentials, private photos, session data, or production fixtures.

This is a public source snapshot. A push or merge is not a live deployment. Review conventions, branch protection and deployment authorization are separate; only claim enforcement or deployment you verified.
