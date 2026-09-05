# Execution Provider

PyTerminal's backend never runs untrusted Python itself. All code execution is
delegated to an external, already-sandboxed execution service through a single
adapter file: `backend/services/executionService.js`.

## Default: Piston (public instance)

By default the backend talks to the public Piston API at `https://emkc.org/api/v2/piston`.
Piston (https://github.com/engineer-man/piston) is a real, open-source, MIT-licensed
sandboxed code execution engine used in production by other developer tools.

**Limitations of the public instance (be upfront about these with users):**

- Rate limited to 5 requests/second, shared across all Piston users worldwide.
- Only base language runtimes are installed - **no numpy, pandas, matplotlib,
  scikit-learn, scipy, sympy, Pillow, openpyxl, flask, or fastapi** on the public
  instance. Only Python's standard library and `requests`/`beautifulsoup4`-style
  pure-Python packages that happen to be vendored will work reliably.
- No true "kill the remote process" API - stopping cancels the backend's HTTP
  request to Piston, but the sandboxed process itself terminates on its own
  `run_timeout` regardless. This is why PyTerminal enforces a hard timeout on
  every run.
- Piston's public API does not stream stdout live - it returns the complete
  result once the run finishes. This is why PyTerminal's "Terminal" mode uses
  genuine data but renders it as a single delivered response, and "Simulated
  Live Output" mode is explicitly labeled as simulated rather than claiming
  real streaming.

## Self-hosting Piston (recommended for production / real package support)

```bash
git clone https://github.com/engineer-man/piston
cd piston
docker-compose up -d api
# install extra Python packages via the Piston CLI, e.g.:
cd cli && npm i
node index.js ppman install python 3.10.0
```

Then set in your backend `.env`:

Self-hosted Piston lets you install additional pip packages into its Python
runtime image, raise `run_memory_limit`, and remove the 5 req/s ceiling.

## Swapping providers entirely

Any provider can be used as long as you re-implement the two exported
functions in `executionService.js`:

```js
async function runPythonProject({ projectFiles, entryFile, timeoutMs, signal }) { ... }
async function getPythonVersion() { ... }
```

Reasonable alternatives:

- **Judge0** (https://judge0.com) - similar sandboxed multi-language execution API,
  supports package-rich Python images on self-hosted instances.
- **AWS Lambda** with a locked-down container image (no network egress, tight
  memory/CPU limits, a fresh execution environment per invocation) - more setup,
  but gives full control over the installed package set.
- **Firecracker / gVisor-based custom runner** - most control, most operational
  overhead.

Whatever you choose, keep enforcing on the _provider_ side (not just the Node
process): execution timeout, memory limit, no network access from inside the
sandbox, and a filesystem that is destroyed after each run.
