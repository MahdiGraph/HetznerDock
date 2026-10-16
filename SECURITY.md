# Security policy

Hetzner Dock holds Hetzner Cloud API tokens and Hetzner Robot webservice passwords that can power off, reset, reinstall and wipe servers, so security reports are taken seriously.

## Reporting a vulnerability

Please do **not** open a public issue. Report it privately instead:

1. Go to the [Security tab](https://github.com/MahdiGraph/HetznerDock/security) of this repository.
2. Press **Report a vulnerability** and describe the problem, how to reproduce it and what an attacker could do.

You will get an answer as soon as possible. Once a fix is released, the advisory is published with credit to you, unless you prefer to stay anonymous.

## Supported versions

Only the latest release receives security fixes. Update by running the installer again:

```bash
curl -fsSL https://raw.githubusercontent.com/MahdiGraph/HetznerDock/main/install.sh | sudo bash
```

HetznerDock 1.x is no longer maintained. Version 2 is a rewrite; move to it.

## Hardening your installation

- Put the panel behind HTTPS (see the README) and listen on `127.0.0.1` when a reverse proxy is in front.
- Create the admin account right after installing; until then, anyone who opens the panel can claim it.
- Give each person their own user account and remove accounts that are no longer needed.
- Turn off under *Settings → What users can do* whatever your users do not need.
- Use a separate Hetzner project for the servers you share, so a token can only reach those servers.
- Give the panel a Robot webservice user of its own, so you can change or revoke its password in Robot without touching your other tools.
- Keep `APP_SECRET` (in `/opt/hetzner-dock/.env`) private and back it up together with the database.
