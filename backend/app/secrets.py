from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)


def fetch_aws_secrets(secret_name: str, region: str) -> dict:
    """Fetch secrets from AWS Secrets Manager.

    Returns an empty dict when the call fails or boto3 is unavailable,
    allowing the caller to fall back to environment variables.
    """
    try:
        import boto3
        from botocore.exceptions import ClientError

        client = boto3.client("secretsmanager", region_name=region)
        response = client.get_secret_value(SecretId=secret_name)
        return json.loads(response["SecretString"])
    except Exception as exc:
        logger.debug("AWS Secrets Manager unavailable, falling back to env: %s", exc)
        return {}
