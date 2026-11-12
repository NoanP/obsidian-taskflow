# TaskFlow maintenance

Keep user task data local. Never commit vault contents, credentials or `.obsidian`.
`main.js` is both source and release artifact; only Obsidian is a runtime dependency.
Preserve unknown frontmatter fields and body text on status changes.
Use Vault.process for existing file writes. Retain optimistic conflict checks for full-editor writes.
Run `npm run check` and `npm test`; verify changed UI in an Obsidian test vault.
Update CHANGELOG.md for user-visible changes. Version manifest.json, package.json and versions.json consistently.
The release workflow publishes a new, immutable numbered release after checks on main.
Document migration and compatibility limitations honestly. Do not import or modify other plugins' tasks without explicit scope.
