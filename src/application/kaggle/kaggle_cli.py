"""Kaggle CLI subprocess wrapper."""

import os
import subprocess
from typing import List, Tuple

from domain.exceptions import ValidationError


class KaggleCliClient:
    """Runs Kaggle CLI commands with credential environment."""

    def build_env(self, username: str, api_key: str) -> dict:
        env = os.environ.copy()
        env["KAGGLE_USERNAME"] = username
        env["KAGGLE_KEY"] = api_key
        return env

    def run(self, args: List[str], env: dict, timeout: int = 300) -> Tuple[bool, str]:
        try:
            result = subprocess.run(
                args,
                capture_output=True,
                text=True,
                timeout=timeout,
                env=env,
            )
            if result.returncode != 0:
                return False, result.stderr.strip() or result.stdout.strip()
            return True, ""
        except subprocess.TimeoutExpired:
            return False, "Command timed out"
        except FileNotFoundError:
            return False, "Kaggle CLI not installed"

    def validate_credentials(self, username: str, api_key: str) -> bool:
        env = self.build_env(username, api_key)
        success, error = self.run(
            ["kaggle", "datasets", "list", "--mine", "--max-size", "1"],
            env,
            timeout=30,
        )
        if success:
            return True

        if "401" in error or "unauthorized" in error.lower():
            raise ValidationError(
                "Invalid Kaggle credentials. Please check your username and API token.",
                "INVALID_CREDENTIALS",
            )
        if error == "Kaggle CLI not installed":
            raise ValidationError(
                "Kaggle CLI not installed. Please install kaggle package.",
                "CLI_NOT_FOUND",
            )
        if error == "Command timed out":
            raise ValidationError("Kaggle API request timed out.", "TIMEOUT")

        raise ValidationError(f"Kaggle API error: {error}", "API_ERROR")

    def create_dataset(self, directory: str, env: dict, timeout: int = 600) -> Tuple[bool, str]:
        return self.run(
            ["kaggle", "datasets", "create", "-p", directory, "--dir-mode", "zip"],
            env,
            timeout=timeout,
        )

    def version_dataset(
        self,
        directory: str,
        env: dict,
        message: str,
        delete_old_versions: bool = False,
        timeout: int = 600,
    ) -> Tuple[bool, str]:
        args = ["kaggle", "datasets", "version", "-p", directory, "-m", message]
        if delete_old_versions:
            args.append("--delete-old-versions")
        return self.run(args, env, timeout=timeout)
