#!/usr/bin/env python3
"""
Extrae privateKeyPem y certificatePem desde un PFX base64.
Soporta PFX legacy (RC2/3DES) comunes en certificados SII chilenos.

Uso:
    python3 pfx_extract.py --pfx <base64_pfx> --password <password>

Stdout: JSON con { "privateKeyPem": "...", "certificatePem": "..." }
"""

import sys
import argparse
import base64
import json

from cryptography.hazmat.primitives.serialization import pkcs12 as crypto_pkcs12
from cryptography.hazmat.primitives import serialization


def main():
    parser = argparse.ArgumentParser(description='Extract PEM from legacy PFX')
    parser.add_argument('--pfx', required=True, help='PFX as base64')
    parser.add_argument('--password', required=True, help='PFX password')
    args = parser.parse_args()

    pfx_bytes = base64.b64decode(args.pfx)
    password_bytes = args.password.encode('utf-8') if args.password else b''

    private_key, cert, _ = crypto_pkcs12.load_key_and_certificates(
        pfx_bytes, password_bytes
    )

    key_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ).decode('ascii')

    cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode('ascii')

    print(json.dumps({ "privateKeyPem": key_pem, "certificatePem": cert_pem }))


if __name__ == '__main__':
    main()
