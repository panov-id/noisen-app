import os, requests

TOKEN = os.environ["GITHUB_TOKEN"]
REPO  = os.environ.get("GITHUB_REPO", "panov-id/noisen-app")
H     = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json"}

runs = requests.get(f"https://api.github.com/repos/{REPO}/actions/runs?per_page=8", headers=H).json()

if not runs.get("workflow_runs"):
    print("No runs found.")
    raise SystemExit(0)

for r in runs["workflow_runs"]:
    status = r["conclusion"] or r["status"]
    print(f"[{status:12}] {r['name']:<28} branch={r['head_branch']} sha={r['head_sha'][:7]} id={r['id']}")

    if status in ("failure", "startup_failure"):
        jobs = requests.get(f"https://api.github.com/repos/{REPO}/actions/runs/{r['id']}/jobs", headers=H).json()
        for job in jobs.get("jobs", []):
            if job["conclusion"] == "failure":
                print(f"  ✗ Failed job: {job['name']}")
                for step in job.get("steps", []):
                    if step["conclusion"] == "failure":
                        print(f"    ✗ Step: {step['name']}")
                logs = requests.get(
                    f"https://api.github.com/repos/{REPO}/actions/jobs/{job['id']}/logs",
                    headers=H, allow_redirects=True)
                if logs.ok:
                    lines = logs.text.splitlines()
                    print("  ── log tail ──────────────────────────────────────")
                    for line in lines[-50:]:
                        print(f"  {line}")
