import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FullConfig } from '@playwright/test';
import { sessionCookies } from '../helpers/session';
import './env';
import { seedUsers, type SeedUserName } from './seed-users';

export const STORAGE_DIR = path.join(__dirname, '..', '.auth');
export const storageStatePath = (name: SeedUserName) => path.join(STORAGE_DIR, `${name}.json`);

/**
 * Seeds users and writes a signed-in Playwright storage state per user, so specs can start
 * authenticated: test.use({ storageState: storageStatePath('alice') }).
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = new URL(config.projects[0]?.use.baseURL ?? 'http://localhost:8888');
  const users = await seedUsers();
  mkdirSync(STORAGE_DIR, { recursive: true });
  for (const [name, user] of Object.entries(users) as [SeedUserName, (typeof users)[SeedUserName]][]) {
    const cookies = (await sessionCookies(user)).map((c) => ({
      name: c.name,
      value: c.value,
      domain: baseURL.hostname,
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: baseURL.protocol === 'https:',
      sameSite: 'Lax' as const,
    }));
    writeFileSync(storageStatePath(name), JSON.stringify({ cookies, origins: [] }, null, 2));
  }
}
