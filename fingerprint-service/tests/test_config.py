import pytest
from fingerprint_service import config


class TestResolveSampleRate:
    @pytest.mark.parametrize("raw", ["22050", "44100"])
    def test_accepts_supported_rates(self, raw):
        assert config.resolve_sample_rate(raw) == int(raw)

    def test_reads_the_env_when_not_given_one(self, monkeypatch):
        monkeypatch.setenv("FINGERPRINT_SAMPLE_RATE", "44100")
        assert config.resolve_sample_rate() == 44100

    def test_defaults_to_22050(self, monkeypatch):
        monkeypatch.delenv("FINGERPRINT_SAMPLE_RATE", raising=False)
        assert config.resolve_sample_rate() == 22050

    @pytest.mark.parametrize("raw", ["48000", "11025", "0"])
    def test_rejects_an_unsupported_rate(self, raw):
        with pytest.raises(ValueError, match="must be one of"):
            config.resolve_sample_rate(raw)

    @pytest.mark.parametrize("raw", ["fast", "", "44.1k"])
    def test_rejects_a_non_integer(self, raw):
        with pytest.raises(ValueError, match="must be an integer"):
            config.resolve_sample_rate(raw)


class TestResolveQueues:
    """Which lists one worker pops (#282)."""

    def test_defaults_to_live_and_index_without_sets(self, monkeypatch):
        monkeypatch.delenv("FINGERPRINT_QUEUES", raising=False)
        assert config.resolve_queues() == (config.QUEUE_KEY, config.INDEX_QUEUE_KEY)

    @pytest.mark.parametrize("raw", ["", "  ", " , "])
    def test_blank_means_the_default(self, raw):
        assert config.resolve_queues(raw) == config.DEFAULT_QUEUES

    def test_reads_the_env_when_not_given_one(self, monkeypatch):
        monkeypatch.setenv("FINGERPRINT_QUEUES", "fingerprint_set_queue")
        assert config.resolve_queues() == (config.SET_QUEUE_KEY,)

    def test_priority_is_ours_not_the_envs(self):
        # BRPOP serves keys in argument order: index-before-live would starve
        # live windows behind a whole library pass.
        raw = "fingerprint_set_queue, fingerprint_index_queue,fingerprint_queue"
        assert config.resolve_queues(raw) == config.KNOWN_QUEUES

    def test_duplicates_collapse(self):
        raw = "fingerprint_queue,fingerprint_queue"
        assert config.resolve_queues(raw) == (config.QUEUE_KEY,)

    def test_rejects_an_unknown_queue(self):
        with pytest.raises(ValueError, match="unknown queue"):
            config.resolve_queues("fingerprint_queue,download_queue")


class TestDefaults:
    def test_uses_its_own_queue_not_the_download_queue(self):
        assert config.QUEUE_KEY == "fingerprint_queue"

    def test_the_socket_outlives_the_block_it_waits_on(self):
        # Equal timeouts race, and the socket loses: the loop takes a
        # TimeoutError on every idle cycle instead of an empty result.
        assert config.SOCKET_TIMEOUT > config.BRPOP_TIMEOUT
        assert config.redis_conn.connection_pool.connection_kwargs[
            "socket_timeout"
        ] == config.SOCKET_TIMEOUT

    def test_heartbeat_outlives_one_brpop_wakeup(self):
        # The healthcheck allows one missed refresh, so the loop must wake at
        # least twice inside HEARTBEAT_TTL or the container looks unhealthy.
        assert config.BRPOP_TIMEOUT * 2 < config.HEARTBEAT_TTL

    def test_a_busy_worker_beats_well_inside_the_ttl(self):
        # The background beat during a long job needs the same margin.
        assert config.HEARTBEAT_INTERVAL * 2 < config.HEARTBEAT_TTL

    def test_sets_have_their_own_queue(self):
        assert config.SET_QUEUE_KEY == "fingerprint_set_queue"
        assert config.SET_QUEUE_KEY not in config.DEFAULT_QUEUES
