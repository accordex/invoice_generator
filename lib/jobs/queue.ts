import PgBoss from 'pg-boss';

let boss: PgBoss | null = null;

/**
 * Returns the shared pg-boss instance, starting it on first use.
 */
export async function getBoss(): Promise<PgBoss> {
  if (!boss) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for pg-boss');
    }
    boss = new PgBoss(connectionString);
    await boss.start();
  }
  return boss;
}
