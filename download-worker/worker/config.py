import logging
import os

import redis

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

redis_conn = redis.from_url(os.getenv('REDIS_URL', 'redis://localhost:6379'))

HEARTBEAT_KEY = os.getenv('WORKER_HEARTBEAT_KEY', 'worker:heartbeat')
HEARTBEAT_TTL = int(os.getenv('WORKER_HEARTBEAT_TTL', '30'))

ESSENTIA_DATA_DIR = os.getenv('ESSENTIA_DATA_DIR', '/app/essentia-data')
JOBS_UPDATED_INDEX_KEY = os.getenv('JOBS_UPDATED_INDEX_KEY', 'jobs:updated')
JOB_TTL_ACTIVE_SECONDS = int(os.getenv('JOB_TTL_ACTIVE_SECONDS', '604800'))
JOB_TTL_TERMINAL_SECONDS = int(os.getenv('JOB_TTL_TERMINAL_SECONDS', '259200'))
