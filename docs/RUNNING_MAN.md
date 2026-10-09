# Staged shared CI admission

Shared source: https://github.com/bradheitmann/running-man. Use the checksummed v0.1.1 release.
The workflow opts into shared admission only when `RUNNING_MAN_ENABLED=true`; the default keeps
all existing commands, contexts, labels, setup pins and sparse checkout. This candidate does not
restart the offline Isoscope registration, change current jobs or enable the coordinator.

Before enabling future work, let current unmanaged jobs finish naturally and verify host/guest
processes as well as GitHub runner state. Provision RUNNING_MAN_BIN, RUNNING_MAN_URL,
RUNNING_MAN_IMAGE_ID as variables and RUNNING_MAN_TOKEN as a secret through approved access.
The common pool must include decisive-path's physical MacBook Pro usage. Guest/native networking,
runner registration, VM changes and startup jobs remain owner-controlled fleet operations.

Both validation chains preserve their original commands and failure exits. Each includes package
locks, the workflow, toolchain/image identity and a unique run/attempt/job workspace key. Successful
reuse is disabled for these complete artifact-producing chains, and the unique key also prevents
concurrent followers from omitting local build files. The 2-CPU/2-GiB/1050-second request is a
proposed workload reservation, to be checked against measured real consumption; the common pool
must have actual headroom. Queue wait is bounded to 90 seconds.

Acceptance before merge/enablement: both original required contexts pass on a reviewed clean
candidate; original-web static/chunk checks pass with local outputs; mixed-project resource use
fits the approved host budget; receipts contain no credentials. This staged PR does not claim
those live acceptance checks have passed. Keep it disabled until that proof exists.
