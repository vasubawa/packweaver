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

Client: `enabled_client` (Client Mods toggles). Server: `enabled_server` (Server Mods tab; requires Server Pack Packager plugin).

- **Toggle off** → DB flag + jar removed from that side’s tree (instant, no download).
- **Toggle on / add custom** → DB only. Jars land on disk when you run **Rebuild**, **Layer custom mods**, or **Rebuild server**.
- **Create instance** → installs client base pack only. Server tree and customs wait for their buttons.
- **Custom Delete** → DB row + jar gone from client/server trees.
- **Updates** → Overview **Check for updates** scans Modrinth (no download). **Update base pack** → set version + Rebuild client (+ Rebuild server when Server Pack Packager is on). **Update customs** → bump selected versions + Layer client (+ server if that tree exists). Custom Mods tab can update one mod the same way.

### Workspace

```text
instances/{id}/
  original/{realFilename}
  workspace/
    client/{stem}/    # disposable Minecraft tree (export root)
    server/{stem}/    # disposable; Server Pack Packager plugin
```

Source of truth: `original/` + DB. Rebuild = wipe that side’s root → install into `{stem}/` → re-layer enabled customs. No persistent customs cache.

### Export (current)

- Client `{stem}-MODIFIED.zip`
- Server `{stem}-MODIFIED-server.zip` when **Server Pack Packager** plugin is on

## Product scope

Packweaver is a **pack builder / customizer / exporter**, not a launcher (no accounts, Java, or play). Launchers (e.g. Prism) own running the game.

**Far future (exporter plugins only):** optional “install into adjacent tool” (e.g. Prism instance folder) — same family as zip/mrpack, not a second product.

Steal launcher _hygiene_ where it helps authoring (pinning, preserve customs on rebuild, manual CurseForge acquire when authors block API download). Do not steal launcher surface.

### Roadmap order (locked)

1. **Phase 1** — ✅ client workspace / `-MODIFIED.zip`
2. **Phase 2** — ✅ `workspace/server/{stem}` / Server Mods UI / `-MODIFIED-server.zip` (plugin-gated)
3. **After Phase 2** — Modrinth API polish: instance-matched version filters, required-deps prompt, ✅ update detection → rebuild/layer, strict hash verify on downloads
4. **Later** — CurseForge source (+ manual acquire), schema migrations hardening, app updater, install-into-launcher exporters
