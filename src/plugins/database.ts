import { Elysia } from 'elysia'
import { createDatabase } from '../db'

export const database = new Elysia({ name: 'database' }).decorate('db', createDatabase())
