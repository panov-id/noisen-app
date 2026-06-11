"""
One-time environment setup for Noisen:
  1. Create BunnyCDN UAT Storage Zone (noisen-uat)
  2. Create BunnyCDN UAT Pull Zone pointing to it (uat.noisen.space)
  3. Set GitHub Actions secrets for both 'uat' and 'production' environments
"""
import os, sys, json, base64, requests
from nacl import encoding, public

BUNNY_API_KEY      = os.environ["BUNNY_API_KEY"]
BUNNY_PROD_KEY     = os.environ["BUNNY_STORAGE_API_KEY"]
BUNNY_PROD_ZONE    = os.environ["BUNNY_STORAGE_ZONE"]
BUNNY_PROD_PULL_ID = os.environ["BUNNY_PULL_ZONE_ID"]
GITHUB_TOKEN       = os.environ["GITHUB_TOKEN"]
GITHUB_REPO        = os.environ.get("GITHUB_REPO", "panov-id/noisen-app")

BUNNY_HEADERS  = {"AccessKey": BUNNY_API_KEY, "Content-Type": "application/json", "Accept": "application/json"}
GITHUB_HEADERS = {"Authorization": f"Bearer {GITHUB_TOKEN}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}

def step(msg): print(f"\n── {msg}")
def ok(msg):   print(f"   ✓ {msg}")
def info(msg): print(f"   · {msg}")
def err(msg):  print(f"   ✗ {msg}", file=sys.stderr)


# ── 1. BunnyCDN: create UAT storage zone ─────────────────────────────────────
step("BunnyCDN — storage zone")

existing = requests.get("https://api.bunny.net/storagezone", headers=BUNNY_HEADERS).json()
uat_zone = next((z for z in existing if z["Name"] == "noisen-uat"), None)

if uat_zone:
    ok(f"Storage zone 'noisen-uat' already exists (id={uat_zone['Id']})")
else:
    resp = requests.post("https://api.bunny.net/storagezone", headers=BUNNY_HEADERS,
        json={"Name": "noisen-uat", "Region": "DE", "ZoneTier": 0})
    if resp.status_code not in (200, 201):
        err(f"Failed to create storage zone: {resp.status_code} {resp.text}")
        sys.exit(1)
    uat_zone = resp.json()
    ok(f"Created storage zone 'noisen-uat' (id={uat_zone['Id']})")

uat_storage_zone_name     = uat_zone["Name"]
uat_storage_zone_password = uat_zone.get("Password") or uat_zone.get("ReadOnlyPassword", "")

# Fetch full zone details to get password if missing
if not uat_storage_zone_password:
    detail = requests.get(f"https://api.bunny.net/storagezone/{uat_zone['Id']}", headers=BUNNY_HEADERS).json()
    uat_storage_zone_password = detail.get("Password", "")

info(f"Zone name: {uat_storage_zone_name}")
info(f"Zone password: {uat_storage_zone_password[:8]}…")


# ── 2. BunnyCDN: create UAT pull zone ────────────────────────────────────────
step("BunnyCDN — pull zone")

pull_zones = requests.get("https://api.bunny.net/pullzone?page=1&perPage=100", headers=BUNNY_HEADERS).json()
pull_list  = pull_zones if isinstance(pull_zones, list) else pull_zones.get("Items", [])
uat_pull   = next((z for z in pull_list if z["Name"] == "noisen-uat"), None)

if uat_pull:
    ok(f"Pull zone 'noisen-uat' already exists (id={uat_pull['Id']})")
else:
    origin_url = f"https://{uat_storage_zone_name}.b-cdn.net"
    resp = requests.post("https://api.bunny.net/pullzone", headers=BUNNY_HEADERS, json={
        "Name": "noisen-uat",
        "OriginUrl": origin_url,
        "StorageZoneId": uat_zone["Id"],
        "EnableGeoZoneUS": True,
        "EnableGeoZoneEU": True,
        "EnableGeoZoneASIA": False,
        "EnableGeoZoneSA": False,
        "EnableGeoZoneAF": False,
        "CacheControlMaxAgeOverride": 86400,
        "DisableCookies": True,
    })
    if resp.status_code not in (200, 201):
        err(f"Failed to create pull zone: {resp.status_code} {resp.text}")
        sys.exit(1)
    uat_pull = resp.json()
    ok(f"Created pull zone 'noisen-uat' (id={uat_pull['Id']})")

uat_pull_zone_id = str(uat_pull["Id"])

# Add custom hostname uat.noisen.space if not already present
hostnames = [h["Value"] for h in uat_pull.get("Hostnames", [])]
if "uat.noisen.space" not in hostnames:
    resp = requests.post(f"https://api.bunny.net/pullzone/{uat_pull_zone_id}/addHostname",
        headers=BUNNY_HEADERS, json={"Hostname": "uat.noisen.space"})
    if resp.status_code in (200, 201, 204):
        ok("Added hostname uat.noisen.space")
    else:
        info(f"Hostname add returned {resp.status_code} — may need manual SSL setup in panel")
else:
    ok("Hostname uat.noisen.space already present")

info(f"Pull zone id: {uat_pull_zone_id}")
info(f"CDN URL: {uat_pull.get('Hostnames', [{}])[0].get('Value', 'n/a') if uat_pull.get('Hostnames') else 'pending'}")


# ── 3. GitHub: helper to encrypt secrets ─────────────────────────────────────
def get_repo_public_key():
    url  = f"https://api.github.com/repos/{GITHUB_REPO}/actions/secrets/public-key"
    resp = requests.get(url, headers=GITHUB_HEADERS)
    resp.raise_for_status()
    return resp.json()

def get_env_public_key(env_name):
    url  = f"https://api.github.com/repos/{GITHUB_REPO}/environments/{env_name}/secrets/public-key"
    resp = requests.get(url, headers=GITHUB_HEADERS)
    resp.raise_for_status()
    return resp.json()

def encrypt_secret(public_key_b64, secret_value):
    pk    = public.PublicKey(base64.b64decode(public_key_b64), encoding.RawEncoder)
    box   = public.SealedBox(pk)
    enc   = box.encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(enc).decode("utf-8")

def set_repo_secret(name, value):
    key  = get_repo_public_key()
    enc  = encrypt_secret(key["key"], value)
    url  = f"https://api.github.com/repos/{GITHUB_REPO}/actions/secrets/{name}"
    resp = requests.put(url, headers=GITHUB_HEADERS,
        json={"encrypted_value": enc, "key_id": key["key_id"]})
    if resp.status_code in (201, 204):
        ok(f"Secret {name} set")
    else:
        err(f"Failed to set {name}: {resp.status_code} {resp.text}")

def ensure_environment(env_name):
    url  = f"https://api.github.com/repos/{GITHUB_REPO}/environments/{env_name}"
    resp = requests.put(url, headers=GITHUB_HEADERS, json={})
    if resp.status_code in (200, 201):
        ok(f"Environment '{env_name}' ready")
    else:
        info(f"Environment '{env_name}': {resp.status_code}")

def set_env_secret(env_name, name, value):
    """Try environment-level secret first, fall back to repo-level secret."""
    # Try environment secret
    try:
        key  = get_env_public_key(env_name)
        enc  = encrypt_secret(key["key"], value)
        url  = f"https://api.github.com/repos/{GITHUB_REPO}/environments/{env_name}/secrets/{name}"
        resp = requests.put(url, headers=GITHUB_HEADERS,
            json={"encrypted_value": enc, "key_id": key["key_id"]})
        if resp.status_code in (201, 204):
            ok(f"  [{env_name}] {name}")
            return
    except Exception:
        pass
    # Fall back to repo-level secret
    set_repo_secret(name, value)


# ── 4. GitHub: create environments ───────────────────────────────────────────
step("GitHub — environments")
ensure_environment("uat")
ensure_environment("production")


# ── 5. GitHub: set production secrets ────────────────────────────────────────
step("GitHub — production secrets")
set_env_secret("production", "BUNNY_STORAGE_API_KEY", BUNNY_PROD_KEY)
set_env_secret("production", "BUNNY_STORAGE_ZONE",    BUNNY_PROD_ZONE)
set_env_secret("production", "BUNNY_API_KEY",          BUNNY_API_KEY)
set_env_secret("production", "BUNNY_PULL_ZONE_ID",     BUNNY_PROD_PULL_ID)


# ── 6. GitHub: set UAT secrets ───────────────────────────────────────────────
step("GitHub — UAT secrets")
set_env_secret("uat", "BUNNY_UAT_STORAGE_API_KEY", uat_storage_zone_password)
set_env_secret("uat", "BUNNY_UAT_STORAGE_ZONE",    uat_storage_zone_name)
set_env_secret("uat", "BUNNY_UAT_API_KEY",          BUNNY_API_KEY)
set_env_secret("uat", "BUNNY_UAT_PULL_ZONE_ID",     uat_pull_zone_id)


# ── Summary ───────────────────────────────────────────────────────────────────
print()
print("═" * 48)
print(" Setup complete")
print("═" * 48)
print(f" UAT storage zone : noisen-uat  (id={uat_zone['Id']})")
print(f" UAT pull zone    : noisen-uat  (id={uat_pull_zone_id})")
print(f" UAT URL          : https://uat.noisen.space")
print()
print(" GitHub environments created:")
print("   · production  (deploy on tag v*)")
print("   · uat         (deploy on push to main)")
print()
print(" Next steps:")
print("   1. In BunnyCDN panel → Pull zone 'noisen-uat' → SSL → Enable free cert for uat.noisen.space")
print("   2. In your DNS: add CNAME  uat.noisen.space → noisen-uat.b-cdn.net")
print("   3. Push to main to trigger first UAT deploy")
print()
