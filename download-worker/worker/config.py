import logging
import os

import redis

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# How long the loop blocks on brpop waiting for a job. Lives here rather than in
# main so its relationship to SOCKET_TIMEOUT below is visible in one place.
BRPOP_TIMEOUT = 5

# redis-py 8 applies a 5s socket read timeout by default. Left alone that is
# exactly BRPOP_TIMEOUT, so on every idle cycle the socket read times out racing
# the server-side brpop timeout and the loop takes a TimeoutError instead of an
# empty result. Give the socket room to outlive the block it is waiting on.
SOCKET_TIMEOUT = BRPOP_TIMEOUT + 5

redis_conn = redis.from_url(
    os.getenv('REDIS_URL', 'redis://localhost:6379'),
    socket_timeout=SOCKET_TIMEOUT,
)

HEARTBEAT_KEY = os.getenv('WORKER_HEARTBEAT_KEY', 'worker:heartbeat')
HEARTBEAT_TTL = int(os.getenv('WORKER_HEARTBEAT_TTL', '30'))

ESSENTIA_DATA_DIR = os.getenv('ESSENTIA_DATA_DIR', '/app/essentia-data')
JOBS_UPDATED_INDEX_KEY = os.getenv('JOBS_UPDATED_INDEX_KEY', 'jobs:updated')
JOB_TTL_ACTIVE_SECONDS = int(os.getenv('JOB_TTL_ACTIVE_SECONDS', '604800'))
JOB_TTL_TERMINAL_SECONDS = int(os.getenv('JOB_TTL_TERMINAL_SECONDS', '259200'))
