import { BadRequestException } from '@nestjs/common';
import { AuthType } from 'generated/prisma';

export interface CredentialInput {
  api_key_secret?: string;
  email?: string;
  username?: string;
  password?: string;
  config?: Record<string, unknown>;
}

export function applyCredentialFields(
  input: CredentialInput,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (input.api_key_secret !== undefined && input.api_key_secret !== '') {
    data.api_key_secret = input.api_key_secret;
  }
  if (input.email !== undefined && input.email !== '') {
    data.email = input.email;
  }
  if (input.username !== undefined && input.username !== '') {
    data.username = input.username;
  }
  if (input.password !== undefined && input.password !== '') {
    data.password = input.password;
  }
  if (input.config !== undefined) {
    data.config = input.config;
  }

  return data;
}

export function validateCredentialsForAuthType(
  authType: AuthType,
  input: CredentialInput,
): void {
  switch (authType) {
    case AuthType.EMAIL_PASSWORD:
      if (!input.email || !input.password) {
        throw new BadRequestException('Email and password are required');
      }
      return;
    case AuthType.USERNAME_PASSWORD:
      if (!input.username || !input.password) {
        throw new BadRequestException('Username and password are required');
      }
      return;
    case AuthType.BEARER_TOKEN:
    case AuthType.API_KEY:
      if (!input.api_key_secret) {
        throw new BadRequestException('API key is required');
      }
      return;
    case AuthType.OAUTH:
      if (!input.config || Object.keys(input.config).length === 0) {
        throw new BadRequestException('OAuth config is required');
      }
      return;
    default:
      throw new BadRequestException('Unsupported auth type');
  }
}
