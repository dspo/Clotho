# create-tauri-agent-app

Minimal scaffold for the Tauri Agent Runtime Framework.

Usage:

```bash
create-tauri-agent-app prompt-only ./my-agent-app
create-tauri-agent-app declarative ./my-agent-app
create-tauri-agent-app operator ./my-agent-app
```

Templates:

- `prompt-only`: minimal prompt-centric agent definition
- `declarative`: resource/action/domain declarations included
- `operator`: a starting point for higher-permission tools and operator flows

Local development in this repo:

```bash
node packages/create-tauri-agent-app/bin/create-tauri-agent-app.mjs prompt-only ./tmp-agent
```
