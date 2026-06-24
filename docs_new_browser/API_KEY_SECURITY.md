# API Key Security & BYOK — Native Browser

> Native-shell deltas to the extension's BYOK story. Read `../docs/API_KEY_SECURITY.md` for the unchanged BYOK rationale and the data-egress contract. This doc covers the changes that come from running in a native process with OS-keychain access.

---

## 1. Why BYOK still

Unchanged from `../docs/API_KEY_SECURITY.md` §1. Zero backend, zero cost to us, privacy-first. The native shell does not change this calculus.

## 2. Supported keys

Unchanged: LLM key (Anthropic / OpenAI / Google) + Search key (Brave). Acquired by the user from each provider's console. The settings drawer ([`UI_UX_SPEC.md`](./UI_UX_SPEC.md) §4) is the one and only entry point.

## 3. Storage — the main delta

The extension stored keys in `chrome.storage.local` with a derived-key obfuscation. The native shell uses the **OS keychain** via Electron's `safeStorage`:

```
key  ─►  safeStorage.encryptString(key)  ─►  Buffer  ─►  userData/secrets.bin
```

| Platform | Backing store |
|---|---|
| macOS | Keychain (`SecKeychain`). |
| Windows | DPAPI (per-user-profile). |
| Linux | `libsecret` (GNOME Keyring / KWallet) — must be configured. |

Properties:

- The encryption key never leaves the OS keychain. Our process asks the OS to encrypt / decrypt; we never see the raw key material that protects the API key.
- A different user account on the same machine cannot read the encrypted blob.
- A disk image / backup of `userData/secrets.bin` is useless without the originating user's OS keychain.

**Hard rule:** if `safeStorage.isEncryptionAvailable()` returns `false`, we DO NOT fall back to plaintext on disk. Instead:

- The settings drawer surfaces a yellow banner: *"OS keychain unavailable. Keys are held in memory only and cleared when you quit."*
- Keys are kept in main-process memory (volatile). They are still encrypted in memory using a per-launch random key, just so a crash dump doesn't trivially leak them.
- The user is informed and chooses whether to proceed.

This is honest about the threat model: weaker than a real keychain, but it doesn't pretend to be more.

## 4. Read / write path

```
chrome renderer  ─ ui:settings:put_key { which, key } ─►  main
                                                          │
                                                          ▼
                                              safeStorage.encryptString(key)
                                                          │
                                                          ▼
                                              fs.writeFile(userData/secrets.bin, ...)

main, at LLM call time:
                                              fs.readFile(userData/secrets.bin)
                                                          │
                                                          ▼
                                              safeStorage.decryptString(buf)
                                                          │
                                                          ▼
                                              { Authorization: "Bearer <key>" }
                                                          │
                                                          ▼
                                              fetch("https://api.anthropic.com/...")
```

The key never crosses back to the chrome renderer. The renderer only knows:
- Is a key set? (boolean)
- The last 4 chars (for "API Key: ●●●●…XYZ7" display).

These two facts are exposed via `ui:settings:get` as a sanitized `SettingsView` shape — see [`DATA_SCHEMAS.md`](./DATA_SCHEMAS.md) §2.

## 5. What gets sent to the LLM

Unchanged from `../docs/API_KEY_SECURITY.md` §5:

| Sent | Not sent |
|---|---|
| The claim / draft text the user explicitly invoked on (chat input or selection). | Browsing history. |
| The active tab's URL. | Anything from other tabs. |
| The vibe few-shots for that URL. | Other API keys. |
| Search snippets retrieved by the fact agent. | Cookies, form values, page-level localStorage. |

The first-run flow ([`UI_UX_SPEC.md`](./UI_UX_SPEC.md) §10) makes this visible: a single banner the user dismisses before the first call.

## 6. Threat model (deltas vs extension)

| Threat | Extension behavior | Native browser behavior |
|---|---|---|
| Malicious page reads the API key | Not possible (storage scoped to extension). | Not possible (storage in main process, never exposed to renderers or pages). |
| Malicious extension reads the API key | Possible if the user installed a bad extension that shared origin. | **Not applicable — we ship no extension framework.** |
| Compromised binary download | Lock dependencies, code-review PRs. | Same, plus **code signing** on macOS + Windows (see [`TECH_STACK.md`](./TECH_STACK.md) §7.2). User can verify signer. |
| User backs up / shares `userData/` | Keys were "encrypted" with a process-derivable key — only mildly safer than plaintext. | Keys are encrypted by the OS keychain — backup file is useless on another machine. |
| Linux without a keyring | Same fallback risk. | We refuse plaintext fallback. Banner informs the user. |
| User uses a shared computer (same OS account) | Anyone with the Chrome profile can use the extension with the stored key. | Anyone with this OS account can launch the app and use the key. **Document this**. Add the post-MVP "memory-only" mode for shared machines. |
| User profile theft via malware on the same account | Malware can ask `safeStorage` to decrypt as the user. | Same — keychain doesn't protect against malware running as the user. Not in our threat model to solve. |
| Network adversary | HTTPS-only enforcement. | HTTPS-only enforcement (renderer + Defense fetch + LLM fetch). |
| Phishing impersonation | CWS-only install. | Signed binary + checksum on the release page. Document the canonical download URL. |
| Console logs leak secrets in dev | Lint rule + review. | Lint rule + review. Plus: a build-time check that fails CI if the chrome renderer bundle contains the string `secrets.` outside the `SettingsDrawer` typing. |

## 7. Revocation

Unchanged. If a key leaks:

1. User revokes it at the provider's dashboard.
2. Settings drawer → "Clear stored keys" → re-enter a fresh one.

We don't need a remote kill switch; the provider's revocation is the source of truth.

## 8. Privacy disclosures

For a public release we need a privacy page reachable from the settings drawer "About" section. Content must state:

1. We operate no server. All processing happens in the app or at third-party APIs the user configured.
2. The user's claim/draft text + the active page URL are sent to the user-configured LLM and Search APIs only at the moment of explicit invocation.
3. We store: API keys (encrypted via OS keychain or in-memory-only on unsupported platforms), preferences, vibe profile cache, fact memo. We do not store the user's content beyond the cache TTLs.
4. We do not collect analytics or telemetry.
5. Users can clear all stored data via Settings → Privacy → "Reset all settings" / "Clear stored keys" / "Clear browsing data", or by uninstalling the app.
6. Code signing: macOS Developer ID + notarized. Windows EV-signed (post v1).

Owner must publish at a stable URL before v1. Tracked in `ROADMAP.md` Phase 5.

## 9. Things the native shell changes for the better

- **No `host_permissions` review.** Extensions had to declare every API host in `manifest.json` and get reviewed by Chrome Web Store. Native binary has no such gate; we just `fetch` what we need.
- **No Manifest V3 service-worker amnesia.** Keys decrypt once per session into a long-lived process; we don't re-decrypt per event.
- **No CSP fights** trying to get the chrome renderer's React app to load fonts / inline styles. Our process owns its CSP.
- **Easier first-run consent UX.** A full-window welcome page (PRD §10) is doable. The extension had to fit consent into a popup or options page.

## 10. Things the native shell changes for the worse

- **Binary supply chain.** A compromised release binary is worse than a compromised extension because there's no store-side review or unpacked-source fallback. Mitigations: code signing, checksums published alongside releases, reproducible build target post-v1.
- **Self-update channel becomes a security surface.** `electron-updater` against GitHub Releases. Updates require valid signing certs — without them, an attacker could publish a malicious release if they hijacked our GitHub. Mitigation: 2FA on the release account, branch protections, manual release approval.
- **No "remove the extension"-style kill switch.** If a critical bug ships, we can't pull it from a store. Users have to update or uninstall manually. Mitigation: auto-update once shipped (v0.2+).

## 11. Things deferred to post-MVP

- **Memory-only mode** for shared machines (key never persists, must be re-entered each launch). Cheap to add post-MVP.
- **Hardware-backed encryption** (e.g., Secure Enclave-bound keys on Apple Silicon). Overkill for v0; revisit if asked.
- **Reproducible builds** so users can verify the binary against source. Process work; not blocked by tech.

## 12. Open security questions

1. **Should we add an "are you sure?" double-confirm before a Defense call sends to the LLM** the first time a session is started on a new domain? Friction; only if telemetry (none in MVP) suggests users are surprised. Default off.
2. **Auto-update signing key compromise** — we don't have a recovery plan. Owner: investigate Sigstore or notary services for the release pipeline post-v1.
3. **Linux Snap / Flatpak packaging** — sandboxed environments may not give `libsecret` access. We'd surface the in-memory-only banner there. Document for the Linux build.
