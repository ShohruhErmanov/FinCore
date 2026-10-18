#!/bin/sh
# The postgres entrypoint *sources* a non-executable .sh, and a bind mount from
# Windows may not keep the executable bit; run the real script in its own
# shell so its `set -eu` and `exit` cannot leak into the entrypoint.
sh /fincore-db/init-fincore.sh
