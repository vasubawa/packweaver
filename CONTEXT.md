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
A boolean state indicating whether an **Instance Mod** is currently active and should be included when the instance is exported/built.
*(Note: The backend stores this as the `enabled` field. While `env_client` conversion applies to Modrinth import/export mapping, `enabled` is the canonical storage value and domain term.)*
