from worker import config


def test_socket_outlives_the_block_it_waits_on():
    # Equal timeouts race, and the socket loses: the loop takes a TimeoutError
    # on every idle cycle instead of an empty result. redis-py 8 defaults the
    # socket read timeout to 5s, which is exactly BRPOP_TIMEOUT.
    assert config.SOCKET_TIMEOUT > config.BRPOP_TIMEOUT


def test_the_connection_carries_that_socket_timeout():
    kwargs = config.redis_conn.connection_pool.connection_kwargs
    assert kwargs["socket_timeout"] == config.SOCKET_TIMEOUT


def test_heartbeat_outlives_one_brpop_wakeup():
    # The healthcheck allows one missed refresh, so the loop must wake at least
    # twice inside HEARTBEAT_TTL or the container looks unhealthy.
    assert config.BRPOP_TIMEOUT * 2 < config.HEARTBEAT_TTL
