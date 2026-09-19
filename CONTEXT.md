# Domain Context

This glossary defines the canonical language for the Packweaver domain model. When discussing or implementing these concepts, use these terms consistently across the frontend, backend, and database.

## Glossary

### Instance

A workspace created by the user. An Instance always starts from a **Base Pack** chosen from a specific **Platform Source**, and acts as a layer where the user can add their own **Custom Mods**.

### Base Pack

An existing modpack (e.g., published on Modrinth) that serves as the foundation for an **Instance**.

### Platform Source

The platform or origin (e.g., Modrinth, local files) from which a Base Pack is searched for and selected.

### Instance Mod

Any mod that is part of an Instance. This is an umbrella term for two specific types of mods:

- **Base Mod**: A mod that is inherited directly from the Base Pack.
- **Custom Mod**: An extra mod added manually by the user on top of the Base Pack. Keeping these separate is crucial so that the Base Pack can be updated independently without losing the user's added Custom Mods.

### Mod State (Enabled)

Whether an **Instance Mod** is active for the client workspace (`enabled_client`; Phase 1 UI uses this). Disabled mods are **removed from `workspace/`** (not left as `.disabled`). Re-enable restores the jar. Custom Delete removes DB row + workspace jar. `enabled_server` exists for Phase 2.

### Workspace

Disposable Minecraft-instance tree under `instances/{id}/workspace/`. Source of truth is `original/` + DB. **Rebuild** = wipe → install base → re-layer enabled customs.

### Export (current)

Client `.zip` of the current `workspace/` as `{originalStem}-MODIFIED.zip` on Windows. Server export is Phase 2.

## Product scope

Packweaver is a **pack builder / customizer / exporter**, not a launcher (no accounts, Java, or play). Launchers (e.g. Prism) own running the game.

**Far future (exporter plugins only):** optional “install into adjacent tool” (e.g. Prism instance folder) — same family as zip/mrpack, not a second product.

Steal launcher _hygiene_ where it helps authoring (pinning, preserve customs on rebuild, manual CurseForge acquire when authors block API download). Do not steal launcher surface.

### Roadmap order (locked)

1. **Phase 1** — client workspace install / rebuild / layer / `-MODIFIED.zip`
2. **Phase 2** — server workspace + Server UI + `-MODIFIED-server.zip`
3. **After Phase 2** — Modrinth API polish: instance-matched version filters, required-deps prompt, update detection → rebuild/layer, strict hash verify on downloads
4. **Later** — CurseForge source (+ manual acquire), schema migrations hardening, app updater, install-into-launcher exporters
