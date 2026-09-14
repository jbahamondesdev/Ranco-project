"""Construccion compartida del cliente de Azure OpenAI (API surface v1), usada por
mapping.py y field_chat.py - centraliza el chequeo de configuracion y el mensaje de
error en vez de repetirlo en cada modulo.
"""

from app.config import get_settings
from app.pipeline.document_intelligence import AzureNotConfiguredError


def get_openai_client():
    """Cliente de OpenAI listo para usar contra Azure AI Foundry, o lanza
    AzureNotConfiguredError con un mensaje claro si falta configuracion."""
    settings = get_settings()
    if not settings.azure_openai_configured:
        raise AzureNotConfiguredError(
            "Azure OpenAI no esta configurado: define AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY "
            "y AZURE_OPENAI_DEPLOYMENT en backend/.env"
        )

    from openai import OpenAI

    return OpenAI(base_url=settings.azure_openai_base_url, api_key=settings.azure_openai_key)
