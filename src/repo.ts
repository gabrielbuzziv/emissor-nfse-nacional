import type { Nota, Repo } from './notas'

const DPS_COUNTER = 'dps'

export const createD1Repo = (db: D1Database): Repo => ({
  get: async (id) => {
    const row = await db.prepare('SELECT data FROM notas WHERE id = ?').bind(id).first<{ data: string }>()
    return row ? (JSON.parse(row.data) as Nota) : null
  },
  save: async (nota) => {
    await db
      .prepare(
        `INSERT INTO notas (id, status, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET status = excluded.status, data = excluded.data, updated_at = excluded.updated_at`,
      )
      .bind(nota.id, nota.status, JSON.stringify(nota), nota.createdAt, nota.updatedAt)
      .run()
  },
  create: async (nota) => {
    const result = await db
      .prepare('INSERT INTO notas (id, status, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING')
      .bind(nota.id, nota.status, JSON.stringify(nota), nota.createdAt, nota.updatedAt)
      .run()
    return result.meta.changes > 0
  },
  nextNumber: async () => {
    const row = await db
      .prepare('INSERT INTO counters (name, value) VALUES (?, 1) ON CONFLICT (name) DO UPDATE SET value = value + 1 RETURNING value')
      .bind(DPS_COUNTER)
      .first<{ value: number }>()
    if (!row) throw new Error('could not reserve a DPS number')
    return row.value
  },
  list: async ({ status, limit, before }) => {
    const filters = [status ? 'status = ?' : '', before ? 'created_at < ?' : ''].filter(Boolean)
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const params = [status, before].filter((value): value is string => Boolean(value))
    const { results } = await db
      .prepare(`SELECT data FROM notas ${where} ORDER BY created_at DESC LIMIT ?`)
      .bind(...params, limit)
      .all<{ data: string }>()
    return results.map((row) => JSON.parse(row.data) as Nota)
  },
})

/** In-memory Repo for tests. */
export const createMemoryRepo = (): Repo & { notas: Map<string, Nota>; setCounter(value: number): void } => {
  const notas = new Map<string, Nota>()
  let counter = 0
  return {
    notas,
    setCounter: (value) => {
      counter = value
    },
    get: async (id) => structuredClone(notas.get(id) ?? null),
    save: async (nota) => {
      notas.set(nota.id, structuredClone(nota))
    },
    create: async (nota) => {
      if (notas.has(nota.id)) return false
      notas.set(nota.id, structuredClone(nota))
      return true
    },
    nextNumber: async () => ++counter,
    list: async ({ status, limit }) => [...notas.values()].filter((nota) => !status || nota.status === status).slice(0, limit),
  }
}
