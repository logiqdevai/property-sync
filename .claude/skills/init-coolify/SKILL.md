---
name: coolify-vps-setup
description: Install Coolify on a fresh VPS (Part A), or harden fresh VPSs and add them as remote servers to an existing Coolify instance (Part B).
---

# Coolify on a Fresh VPS: Generic Setup Runbook

Reusable for any fresh Ubuntu VPS (tested on OVHcloud, Ubuntu 26.04 LTS, Coolify 4.4.x).
Written so an AI agent can run the server-side steps over SSH and clearly tell the human which steps must happen elsewhere (provider panel, DNS, local terminal, browser).

## START HERE (agent: do this first, every time)

Do not run any command yet. First ask the user which job this is, using AskUserQuestion:

1. **Install Coolify** on a fresh VPS -> follow Part A (sections 1-12).
2. **Add VMs to an existing Coolify instance** (harden them, then connect them as remote servers) -> follow Part B.

Then collect everything needed for the chosen job. Ask for all of it up front, in one round, and do not guess missing values.

**Part A, ask for:**
- VPS public IP
- Initial SSH user (usually `ubuntu`) and the current password (or confirmation that the key is already installed)
- Dashboard domain (e.g. `coolify.example.com`) and whether DNS is already pointing at the VPS
- Which local public key to authorize (default: `~/.ssh/id_ed25519.pub`)

**Part B, ask for:**
- IP address of **each** VM to add (one or many)
- Initial SSH user (usually `ubuntu`; if unknown, probe `root`, `ubuntu`, `debian`) and the password for the VMs, or confirmation keys are already installed
- The Coolify instance: its URL and an **API token with `write` permission** (a read-only token cannot create servers; the agent must check this first)
- IP and SSH access of the Coolify host itself (needed to exempt it in fail2ban and, if needed, to read its public key). Key login is normal here; the password may not work
- Which local public key to also authorize on the new VMs (default: `~/.ssh/id_ed25519.pub`)
- Whether root key login is acceptable for Coolify (default yes, `prohibit-password`) or a non-root sudo user is wanted
- Any extra ports the VMs must expose besides 22, 80, 443

Secrets handling for the whole session: never write passwords or tokens into this file, the repo or memory. Keep the password only in a temporary helper file in the scratchpad and delete it at the end. Remind the user to rotate any password or token they pasted into chat.

## Part A: Install Coolify on a fresh VPS

## Placeholders

Replace these for each new server:

| Placeholder | Meaning |
|---|---|
| `<VPS_IP>` | Public IPv4 of the VPS |
| `<SSH_USER>` | Initial user from the provider email (usually `ubuntu`) |
| `<DASHBOARD_DOMAIN>` | Coolify dashboard hostname, e.g. `coolify.example.com` |
| `<SUBNET>` | Docker address range (default `10.0.0.0/8`; see section 9) |

> Never put passwords, SSH private keys, Coolify secrets or the contents of `/data/coolify/source/.env` in this document, in chat, or in Git.

---

## Who does what

| Actor | Responsibilities |
|---|---|
| Human | Provider panel, first password change, DNS records, browser steps (Coolify admin account, settings), local `scp` backup |
| AI agent (SSH) | Updates, SSH hardening, UFW, fail2ban, Coolify install, firewall/Docker fixes, verification |

---

## 1. First login and password change (human)

The provider email gives a user and a temporary password.

```powershell
ssh <SSH_USER>@<VPS_IP>
```

1. Type `yes` to accept the host key.
2. Enter the temporary password (nothing shows as you type).
3. The server forces a password change: current password, new password, retype. The session then closes. This is expected.
4. Save the new password in a password manager. You still need it for `sudo` if the account has no passwordless sudo.

## 2. Add the SSH public key (human)

Reuse an existing key or create one locally:

```powershell
ssh-keygen -t ed25519
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

Log in again with the new password and add the **public** key (single line):

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo "<PUBLIC_KEY_LINE>" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
```

### Agent: verify key login before anything else

```bash
ssh -o BatchMode=yes <SSH_USER>@<VPS_IP> 'whoami; lsb_release -d; sudo -n true && echo sudo-ok'
```

If this prints `Permission denied (publickey,password)`, the key is not installed yet. Stop and ask the human to finish section 2.

## 3. DNS (human)

At the DNS provider create an A record:

```text
Type:  A
Name:  <subdomain only, e.g. coolify>
Value: <VPS_IP>
TTL:   3600
```

Tips:
- Enter only the subdomain in the Name field. Some DNS panels append the zone automatically, and typing the full hostname produces a doubled name like `host.example.com.example.com`. After saving, check the row reads correctly.
- If the DNS panel rejects the save with "Duplicate CNAME record" (or similar), the problem is an existing duplicate CNAME elsewhere in the zone, not the new record. The panel validates the whole zone on every save. Find CNAME rows that share a name and delete the extra one.
- A domain listing nameservers from two providers (e.g. registrar plus Vercel) is a common source of confusing zone state. Check which nameserver actually holds the records.

Agent verification:

```bash
nslookup <DASHBOARD_DOMAIN> 8.8.8.8
```

Expected: `<VPS_IP>`. Let's Encrypt cannot issue the dashboard certificate until this resolves.

## 4. Update Ubuntu (agent)

```bash
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq -o Dpkg::Options::=--force-confold
ls /var/run/reboot-required 2>&1
```

Only reboot if `/var/run/reboot-required` exists (or the running kernel differs from the installed one). If rebooting: `sudo reboot`, wait 30-60 s, reconnect.

## 5. Harden SSH (agent)

Use a drop-in file so cloud-init overrides cannot undo it (the first value found wins, hence the `00-` prefix):

```bash
printf "PasswordAuthentication no\nPermitRootLogin no\n" | sudo tee /etc/ssh/sshd_config.d/00-hardening.conf
sudo sshd -t && sudo sshd -T | grep -Ei "^(passwordauthentication|permitrootlogin)"
sudo systemctl restart ssh
```

### Safety rule: never lock yourself out

Keep the working SSH session open. After restarting, open a **second** connection and confirm key login still works. Confirm password login is now rejected:

```bash
ssh -o BatchMode=yes <SSH_USER>@<VPS_IP> 'echo second-connection-ok'
ssh -o BatchMode=yes -o PreferredAuthentications=password -o PubkeyAuthentication=no <SSH_USER>@<VPS_IP> true   # expect: Permission denied (publickey)
```

## 6. UFW firewall (agent)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status verbose
```

Verify SSH still works from a second connection afterwards.

> Docker publishes ports by writing its own firewall rules, which **bypass UFW**. A port being absent from `ufw status` does not mean it is closed. See section 10.

## 7. Fail2ban (agent)

```bash
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fail2ban
sudo systemctl enable --now fail2ban
sudo fail2ban-client status        # expect: Jail list: sshd
```

Do not edit `jail.conf`. Local overrides go in `/etc/fail2ban/jail.d/`.

## 8. Install Coolify (agent)

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

Takes about a minute. Afterwards:

```bash
sudo docker ps --format "{{.Names}}\t{{.Status}}"   # coolify, coolify-db, coolify-redis healthy
```

The installer warns if `PermitRootLogin` is disabled. That is handled in section 9.

## 9. Let Coolify manage the host over SSH without opening root to the internet (agent)

Coolify's container logs into the host as `root` (via `host.docker.internal`) using its own key. With `PermitRootLogin no`, onboarding fails with:

```text
Server is not reachable ... ssh: connect to host host.docker.internal port 22: Connection refused
```

The root cause is two-part: root login is refused, and each failed attempt counts toward fail2ban, which then bans the container's IP and turns the error into "Connection refused". Fix both, keeping root closed to the internet:

```bash
# Key-only root login, only from Docker networks:
printf "Match Address <SUBNET>\n    PermitRootLogin prohibit-password\n" | sudo tee /etc/ssh/sshd_config.d/10-coolify-docker.conf

# Never let fail2ban ban Docker networks:
printf "[DEFAULT]\nignoreip = 127.0.0.1/8 ::1 <SUBNET>\n" | sudo tee /etc/fail2ban/jail.d/coolify-ignore.local

sudo sshd -t && sudo systemctl restart ssh && sudo fail2ban-client reload
sudo fail2ban-client unban --all      # clear any existing ban
```

`<SUBNET>` is the range Docker uses for container networks. Check it with `sudo docker network inspect coolify --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'` and `cat /etc/docker/daemon.json`. The installer here configured `10.0.0.0/8`; adjust if different.

Verify, expecting the first to print `no` and the second `prohibit-password`:

```bash
sudo sshd -T -C user=root,host=x,addr=203.0.113.9 | grep -i permitrootlogin
sudo sshd -T -C user=root,host=x,addr=<A_DOCKER_IP> | grep -i permitrootlogin
```

Then in Coolify click **Validate Server** on localhost.

If the error persists, diagnose instead of guessing:

```bash
sudo fail2ban-client status sshd                      # is the container IP banned?
sudo nft list ruleset | grep -n "f2b"                 # fail2ban reject rules
```

## 10. Close Docker-published ports (agent)

After the domain works, Coolify's ports `8000` (plain-HTTP dashboard) and `6001`/`6002` (realtime/terminal) are still reachable from the internet despite UFW. Bind them to localhost with Coolify's supported override file (preserved across Coolify upgrades):

```bash
cat <<EOF | sudo tee /data/coolify/source/docker-compose.custom.yml
services:
  coolify:
    ports: !override
      - "127.0.0.1:8000:8080"
      - "127.0.0.1:6001:6001"
      - "127.0.0.1:6002:6002"
EOF

sudo bash -c "cd /data/coolify/source && docker compose --env-file .env \
  -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.custom.yml \
  up -d --no-deps coolify"
```

The dashboard is down for about 10-20 seconds. Traefik reaches Coolify over the internal Docker network, so the HTTPS dashboard keeps working. Verify from outside the server:

```bash
curl -m 8 http://<VPS_IP>:8000     # expect: connection failure
curl -m 15 -o /dev/null -w "%{http_code}\n" https://<DASHBOARD_DOMAIN>   # expect: 302
```

To undo: delete the override file and run the same `up -d` command.

Only do this once the dashboard is reachable through the domain. Locking port 8000 first removes your way in.

## 11. Browser steps in Coolify (human)

1. Open `http://<VPS_IP>:8000` and create the **admin account** immediately. Whoever gets there first becomes admin.
2. Complete the onboarding: choose **localhost** (this server). Click Validate Server (see section 9 if it fails).
3. **Settings -> General:** set the URL to `https://<DASHBOARD_DOMAIN>` and save. DNS must already resolve.
4. **Servers -> localhost -> Proxy:** start Traefik if stopped. Keep Traefik; do not switch proxy.
5. Do this before section 10, because section 10 closes port 8000.

## 12. Back up the Coolify `.env` (agent + human)

`/data/coolify/source/.env` holds Coolify's secrets. Without it you cannot restore the instance. **Never read or print it.**

Agent: stage a copy owned by the SSH user:

```bash
sudo cp /data/coolify/source/.env /home/<SSH_USER>/coolify.env
sudo chown <SSH_USER>:<SSH_USER> /home/<SSH_USER>/coolify.env
sudo chmod 600 /home/<SSH_USER>/coolify.env
```

Human, from **local** PowerShell (not on the VPS). Use a unique file name per server so backups do not overwrite each other:

```powershell
scp <SSH_USER>@<VPS_IP>:/home/<SSH_USER>/coolify.env .\coolify-<server-name>.env
Get-Item .\coolify-<server-name>.env
```

Store it in a password manager or encrypted folder. Not in Git, email or chat.

Agent, after the human confirms the backup exists:

```bash
sudo rm /home/<SSH_USER>/coolify.env
```

---

## Final verification checklist (agent)

```bash
# SSH
ssh -o BatchMode=yes <SSH_USER>@<VPS_IP> 'sudo sshd -T | grep -Ei "^(passwordauthentication|permitrootlogin)"'

# Firewall and fail2ban
sudo ufw status verbose
sudo fail2ban-client status sshd

# Coolify
sudo docker ps --format "{{.Names}}\t{{.Status}}"

# Exposure from OUTSIDE the server
curl -m 8 http://<VPS_IP>:8000            # must fail
curl -m 15 -o /dev/null -w "%{http_code}\n" https://<DASHBOARD_DOMAIN>   # 302
```

Expected end state:
- Key-only SSH, no SSH passwords, no root login from the internet
- UFW allows only 22, 80, 443
- fail2ban `sshd` jail active, Docker networks ignored
- Coolify, Traefik proxy, database and Redis healthy
- Dashboard served over HTTPS at `<DASHBOARD_DOMAIN>`
- Ports 8000, 6001, 6002 bound to localhost only
- `.env` backed up off-server, no temporary copy left on the VPS

## Troubleshooting quick reference

| Symptom | Cause | Fix |
|---|---|---|
| `Permission denied (publickey,password)` right after first login | Public key not added yet | Section 2 |
| Coolify: "Server is not reachable ... Connection refused" | fail2ban banned the container, root login disabled | Section 9 |
| Port 8000 reachable although UFW does not list it | Docker bypasses UFW | Section 10 |
| DNS panel: "Duplicate CNAME record found" on any save | Existing duplicate CNAME in the zone | Section 3 tips |
| Doubled hostname in DNS rows | Full hostname typed into a panel that appends the zone | Enter only the subdomain |
| Dashboard certificate not issued | DNS not resolving to the VPS yet, or Traefik stopped | Sections 3 and 11 |

## Operational rules

- Always verify current state before changing production config.
- Before changing SSH, UFW or provider firewall rules: keep one session open, validate config, test from a second connection, only then close the first.
- Never expose secrets: SSH private keys, VPS and Coolify passwords, `.env`, API tokens, database passwords.
- Do not add security tooling or complicated firewall rules without a concrete reason. Baseline: SSH keys, no SSH passwords, no root from internet, UFW, fail2ban, HTTPS, backups.
- Do not use wildcard DNS unless a later requirement needs it.

## Next step after setup

1. Connect GitHub to Coolify.
2. Create an application: choose repo and branch, set build and runtime options.
3. Add environment variables and secrets in Coolify.
4. Set the application's domain, deploy, verify HTTPS and health.
5. Configure database persistence and backups where needed.

---

# Part B: Harden fresh VPSs and add them to an existing Coolify

Proven on two OVHcloud VPSs (Ubuntu 26.04) added to a running Coolify. Do the VMs one at a time or in a loop; the steps are identical. Placeholders: `<VM_IP>`, `<COOLIFY_HOST_IP>`, `<COOLIFY_URL>`, `<API_TOKEN>`, `<USER_PUBKEY>`, `<COOLIFY_PUBKEY>`, `<KEY_UUID>`.

## B1. Probe the login (agent)

The VMs from a provider usually allow password login for `ubuntu` (not root). Windows has no `sshpass`, so feed the password with an `SSH_ASKPASS` helper written to the **scratchpad** (delete it in B9):

```bash
printf '#!/bin/sh\necho '"'"'<PASSWORD>'"'"'\n' > $SCRATCH/askpass.sh && chmod +x $SCRATCH/askpass.sh
export SSH_ASKPASS=$SCRATCH/askpass.sh SSH_ASKPASS_REQUIRE=force DISPLAY=x
O="-o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no -o ConnectTimeout=10"
ssh $O ubuntu@<VM_IP> 'id; head -2 /etc/os-release; hostname; sudo -n true && echo sudo-ok'
```

Avoid hammering with wrong users: failed attempts feed fail2ban on the targets, and the Coolify host throttles repeated failures (`Connection closed` is usually that; retry after ~20-60 s rather than sleeping a long fixed time).

## B2. Get Coolify's public key (agent)

Coolify connects to remote servers with a private key stored on the Coolify host. Find which key and confirm the public half:

```bash
# On the Coolify host (key login; its password is often disabled):
sudo ls /data/coolify/ssh/keys/
sudo ssh-keygen -y -f /data/coolify/ssh/keys/ssh_key@<KEY_UUID>     # prints <COOLIFY_PUBKEY>
```

The `<KEY_UUID>` is the part after `ssh_key@`. The same key is listed by the API (`GET /api/v1/security/keys`). If more than one exists, ask the user which to use.

## B3. Update, baseline security, keys (agent, one script per VM)

Over the password session, copy `<USER_PUBKEY>` to `/tmp/userkey.pub`, then run (needs passwordless sudo, which OVH images have):

```bash
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo -E apt-get -y -qq -o Dpkg::Options::=--force-confold full-upgrade
sudo -E apt-get -y -qq install ufw fail2ban unattended-upgrades curl ca-certificates
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' | sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null

# Keys: Coolify's key + the user's key for root, the user's key for the SSH user
sudo install -d -m 700 /root/.ssh
echo "<COOLIFY_PUBKEY>" | sudo tee -a /root/.ssh/authorized_keys >/dev/null
cat /tmp/userkey.pub    | sudo tee -a /root/.ssh/authorized_keys >/dev/null
sudo chmod 600 /root/.ssh/authorized_keys; sudo sort -u -o /root/.ssh/authorized_keys /root/.ssh/authorized_keys
install -d -m 700 ~/.ssh; cat /tmp/userkey.pub >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys

# Firewall
sudo ufw default deny incoming; sudo ufw default allow outgoing
sudo ufw allow 22/tcp; sudo ufw allow 80/tcp; sudo ufw allow 443/tcp   # plus any extra ports the user asked for
sudo ufw --force enable

# fail2ban, never banning the Coolify host
printf '[DEFAULT]\nbantime = 1h\nfindtime = 10m\nmaxretry = 5\nignoreip = 127.0.0.1/8 ::1 <COOLIFY_HOST_IP>\n[sshd]\nenabled = true\nbackend = systemd\n' | sudo tee /etc/fail2ban/jail.d/local.conf >/dev/null
sudo systemctl enable --now fail2ban && sudo systemctl restart fail2ban
```

Piping a long script through `ssh ... 'bash -s' < script.sh | tail` can hide the final line; verify state afterwards instead of trusting the tail (`ufw status`, `systemctl is-active fail2ban`, `cat /root/.ssh/authorized_keys`).

## B4. Prove key login BEFORE disabling passwords (agent)

```bash
ssh -i <USER_KEY> -o IdentitiesOnly=yes -o BatchMode=yes root@<VM_IP> 'id -un'
# From the Coolify host, using Coolify's own key:
sudo ssh -i /data/coolify/ssh/keys/ssh_key@<KEY_UUID> -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new root@<VM_IP> 'echo OK $(hostname)'
```

Both must succeed. If either fails, stop and fix keys; do not continue to B5.

## B5. Harden SSH (agent)

```bash
sudo tee /etc/ssh/sshd_config.d/00-hardening.conf >/dev/null <<'C'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
PermitEmptyPasswords no
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
C
sudo sshd -t && sudo systemctl reload ssh
sudo sshd -T | grep -E '^(passwordauthentication|permitrootlogin|kbdinteractiveauthentication) '
```

The `00-` prefix matters: the cloud-init drop-in (`50-cloud-init.conf`) sets `PasswordAuthentication yes`, and the first value wins. `PermitRootLogin prohibit-password` (not `no`) is intentional: Coolify needs root with its key. Password login stays off and root is key-only.

## B6. Reboot if needed and re-verify (agent)

If `/var/run/reboot-required` exists, `sudo systemctl reboot`, then poll `ssh root@<VM_IP>` until it answers and confirm: new kernel, `ufw` active, `fail2ban` active, and that password login now fails (`Permission denied (publickey)`).

## B7. Install Docker (agent)

The Coolify API `validate` call only **checks** for Docker; it does not install it, and the server stays `usable=false`. Install it as root:

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
mkdir -p /data/coolify
docker --version; docker compose version
```

Docker-published ports bypass UFW. Tell the user to publish only ports they intend to expose.

## B8. Add the server to Coolify and validate (agent, via API)

The Coolify MCP is often read-only (it can list but not create). Use the REST API with a token that has the **write** ability; a read-only token returns `403 Missing required permissions: write`. If so, ask the user to create a new token (Keys & Tokens -> API Tokens, `write` or `*`), or have them add the server in the UI (Servers -> Add: IP, user `root`, port 22, the existing key, then Validate).

```bash
# Find the private key to use
curl -s -H "Authorization: Bearer <API_TOKEN>" -H 'Accept: application/json' <COOLIFY_URL>/api/v1/security/keys

# Create the server (returns {"uuid": "..."})
curl -s -X POST -H "Authorization: Bearer <API_TOKEN>" -H 'Accept: application/json' -H 'Content-Type: application/json' \
  <COOLIFY_URL>/api/v1/servers \
  -d '{"name":"<NAME>","ip":"<VM_IP>","port":22,"user":"root","private_key_uuid":"<KEY_UUID>","instant_validate":true}'

# After Docker is installed (B7): re-validate. It is a POST; GET returns 405.
curl -s -X POST -H "Authorization: Bearer <API_TOKEN>" -H 'Accept: application/json' <COOLIFY_URL>/api/v1/servers/<SERVER_UUID>/validate
```

Poll `GET /api/v1/servers` until each new server shows `is_reachable=true` and `is_usable=true` (takes under a minute). Reachable but not usable means Docker is missing or the validation has not finished.

## B9. Clean up and report (agent)

- Delete the `askpass.sh` helper and any temporary scripts from the scratchpad.
- Report per VM: IP, Coolify server name and UUID, OS/kernel, firewall ports, fail2ban state, SSH settings, Docker version.
- Remind the user to rotate pasted passwords and tokens, and to scope down any over-broad API token (a `*`/root token should be revoked after use).

## Part B troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Permission denied` for root, works for `ubuntu` | Provider disables root password login | Log in as `ubuntu`, add keys to root, then use keys |
| `Connection closed by <ip> port 22` | fail2ban / MaxStartups throttle after failed attempts | Wait 20-60 s and retry; do not probe wrong users repeatedly |
| Coolify host rejects the password | It is key-only | Use the user's SSH key instead |
| API `403 Missing required permissions: write` | Read-only token | Get a `write` token, or add the server in the UI |
| Server `reachable=true`, `usable=false` | Docker not installed | B7, then POST `/validate` again |
| `GET .../validate` returns 405 | Endpoint is POST-only | Use `-X POST` |
