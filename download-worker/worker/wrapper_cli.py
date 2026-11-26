"""Owner-operated login; secret input stays in memory and never enters argv."""

import argparse
import getpass
import warnings

from .wrapper import WrapperNotReady, check_wrapper_ready, request_wrapper, wrapper_info, wrapper_url


def hidden_input(prompt: str) -> str:
    # getpass otherwise falls back to echoed input when terminal echo control
    # is unavailable. Fail before reading any secret in that situation.
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        try:
            return getpass.getpass(prompt)
        except getpass.GetPassWarning:
            raise WrapperNotReady(
                "Hidden terminal input is unavailable; run just wrapper-login in an interactive terminal"
            ) from None


def login(url: str) -> None:
    wrapper_info(url)
    if request_wrapper("GET", url, "/session").json().get("state") == "authenticated":
        print("Wrapper session is already signed in")
        return
    username = hidden_input("Apple ID (hidden): ")
    password = hidden_input("Password (hidden): ")
    response = request_wrapper("POST", url, "/session/login", json={"username": username, "password": password})
    del username, password
    if response.status_code == 202:
        challenge = response.json()
        if (
            challenge.get("kind") != "two_factor"
            or not isinstance(challenge.get("challenge_id"), str)
            or not challenge["challenge_id"]
        ):
            raise WrapperNotReady("Wrapper returned an invalid two-factor challenge; retry login")
        code = hidden_input("Six-digit 2FA code (hidden): ")
        if len(code) != 6 or not code.isascii() or not code.isdigit():
            raise WrapperNotReady("Expected a six-digit 2FA code; retry login")
        request_wrapper(
            "POST", url, "/session/challenge", json={"challenge_id": challenge["challenge_id"], "code": code}
        )
        del code
    check_wrapper_ready(url)
    print("Wrapper session is signed in")


def main() -> int:
    parser = argparse.ArgumentParser(description="Local Wrapper v2 owner login and status")
    parser.add_argument("action", choices=("login", "status"))
    action = parser.parse_args().action
    url = wrapper_url()
    if not url:
        print("Enable the lossless profile or configure GAMDL_WRAPPER_URL first")
        return 1
    try:
        if action == "login":
            login(url)
        else:
            architecture = check_wrapper_ready(url)
            print(f"Wrapper v2 1.0.0 {architecture}: signed in")
        return 0
    except WrapperNotReady as error:
        print(str(error))
    except (ValueError, AttributeError, KeyError):
        print("Wrapper returned an invalid response; check its status and retry")
    except (EOFError, KeyboardInterrupt):
        print("Wrapper login cancelled")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
